import ballerina/http;
import ballerina/test;

final http:Client svc = check new ("http://localhost:9090");

@test:Config {}
function testHealthEndpoint() returns error? {
    json res = check svc->get("/health");
    test:assertEquals(res, {status: "UP"});
}

@test:Config {}
function testEmptyItemsRejected() returns error? {
    http:Response res = check svc->post("/notify",
        {toEmail: "test@example.com", pharmacyName: "Test", items: []});
    test:assertEquals(res.statusCode, 400, "Empty item list must be rejected");
}

@test:Config {}
function testMissingFieldsRejected() returns error? {
    http:Response res = check svc->post("/notify", {pharmacyName: "Test"});
    test:assertEquals(res.statusCode, 400, "Payload without required fields must be rejected");
}
