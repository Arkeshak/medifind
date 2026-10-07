param(
  [Parameter(Mandatory = $true)] [string] $Url,      # e.g. http://localhost:8080/webhooks/supplier-delivery
  [Parameter(Mandatory = $true)] [string] $Secret,
  [string] $DeliveryId = "DEL-$(Get-Date -Format 'yyyyMMddHHmmss')",
  [int] $PharmacyId = 2,
  [switch] $BadSignature
)

$payload = @{
  deliveryId = $DeliveryId
  supplier   = "Lanka Pharma Distributors"
  pharmacyId = $PharmacyId
  items      = @(
    @{ medicineId = 1; quantity = 100 },
    @{ medicineId = 4; quantity = 50 }
  )
} | ConvertTo-Json -Depth 5 -Compress

$bytes = [Text.Encoding]::UTF8.GetBytes($payload)
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
$signature = -join ($hmac.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
if ($BadSignature) { $signature = "0" * 64 }

Write-Host "Sending delivery $DeliveryId ..."
try {
  $result = Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json" `
    -Headers @{ "X-Supplier-Signature" = "sha256=$signature" } -Body $bytes
  $result | ConvertTo-Json
} catch {
  Write-Host "Failed: $($_.Exception.Response.StatusCode)"
}
