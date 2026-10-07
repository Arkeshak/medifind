import ballerina/http;
import ballerina/log;

// Values come from Config.toml locally, and from the Choreo config form when deployed
configurable string brevoApiKey = ?;
configurable string senderEmail = ?;
configurable string senderName = "MediFind Alerts";

type LowStockItem record {
    string medicine;
    int quantity;
    int threshold;
};

type NotificationRequest record {
    string toEmail;
    string pharmacyName;
    LowStockItem[] items;
};

type NotificationResponse record {
    boolean sent;
    string message;
};

final http:Client brevo = check new ("https://api.brevo.com/v3");

service / on new http:Listener(9090) {

    resource function get health() returns json {
        return {status: "UP"};
    }

    resource function post notify(NotificationRequest req)
            returns NotificationResponse|http:BadRequest|http:InternalServerError {

        if req.items.length() == 0 {
            return <http:BadRequest>{body: {message: "items cannot be empty"}};
        }

        string rows = "";
        foreach LowStockItem item in req.items {
            string status = item.quantity == 0 ? "OUT OF STOCK" : "LOW";
            string color = item.quantity == 0 ? "#991b1b" : "#92400e";
            rows += string `<tr><td>${item.medicine}</td><td>${item.quantity}</td>`
                + string `<td>${item.threshold}</td><td style="color:${color};font-weight:bold">${status}</td></tr>`;
        }

        string html = string `<div style="font-family:Arial,sans-serif">
            <h2 style="color:#0f766e">MediFind low-stock alert</h2>
            <p>Hello <b>${req.pharmacyName}</b>, the following items need restocking:</p>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
              <tr style="background:#f3f4f6"><th>Medicine</th><th>Qty</th><th>Threshold</th><th>Status</th></tr>
              ${rows}
            </table>
            <p style="color:#6b7280;font-size:12px">Sent automatically by MediFind on WSO2 Choreo.</p>
          </div>`;

        json payload = {
            sender: {name: senderName, email: senderEmail},
            to: [{email: req.toEmail, name: req.pharmacyName}],
            subject: string `MediFind: ${req.items.length()} item(s) need restocking at ${req.pharmacyName}`,
            htmlContent: html
        };

        http:Response|error res = brevo->post("/smtp/email", payload, {"api-key": brevoApiKey});

        if res is error {
            log:printError("Could not reach Brevo", 'error = res);
            return <http:InternalServerError>{body: {message: "Email provider unreachable"}};
        }
        if res.statusCode >= 300 {
            string|error body = res.getTextPayload();
            log:printError("Brevo rejected the email", status = res.statusCode,
                    details = body is string ? body : "");
            return <http:InternalServerError>{body: {message: "Email provider rejected the request"}};
        }

        log:printInfo("Low-stock email sent", pharmacy = req.pharmacyName, to = req.toEmail,
                items = req.items.length());
        return {sent: true, message: "Email sent"};
    }
}
