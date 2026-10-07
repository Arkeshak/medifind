param(
  [Parameter(Mandatory = $true)] [string] $InventoryUrl,   # e.g. https://...choreoapis.dev/medifind/inventory-service/v1.0
  [Parameter(Mandatory = $true)] [string] $SearchUrl,      # GraphQL URL ending in /graphql
  [Parameter(Mandatory = $true)] [string] $Token           # access token from the Devportal
)

$results = @()
function Check($name, [scriptblock] $test) {
  try {
    $ok = & $test
    $script:results += [pscustomobject]@{ Test = $name; Result = $(if ($ok) { 'PASS' } else { 'FAIL' }) }
  } catch {
    $script:results += [pscustomobject]@{ Test = $name; Result = "FAIL ($($_.Exception.Message))" }
  }
}
function StatusOf([scriptblock] $call) {
  try { & $call | Out-Null; return 200 } catch { return [int]$_.Exception.Response.StatusCode }
}
$auth = @{ Authorization = "Bearer $Token" }

Check 'Public search works without login' {
  $r = Invoke-RestMethod "$InventoryUrl/search?medicine=panadol"
  $r.Count -ge 1
}
Check 'Search without medicine returns 400' {
  (StatusOf { Invoke-RestMethod "$InventoryUrl/search" }) -eq 400
}
Check 'Pharmacies require a token (401)' {
  (StatusOf { Invoke-RestMethod "$InventoryUrl/pharmacies" }) -eq 401
}
Check 'Pharmacies work with a token' {
  (Invoke-RestMethod "$InventoryUrl/pharmacies" -Headers $auth).Count -ge 3
}
Check 'Stock write without permission is forbidden (403)' {
  (StatusOf {
    Invoke-RestMethod -Method Post "$InventoryUrl/stock/adjust" -Headers $auth -ContentType 'application/json' `
      -Body '{"pharmacyId":1,"medicineId":1,"changeQty":1}'
  }) -eq 403
}
Check 'Webhook rejects unsigned requests (401)' {
  (StatusOf {
    Invoke-RestMethod -Method Post "$InventoryUrl/webhooks/supplier-delivery" -ContentType 'application/json' `
      -Body '{"deliveryId":"x","supplier":"x","pharmacyId":1,"items":[{"medicineId":1,"quantity":1}]}'
  }) -eq 401
}
Check 'GraphQL search returns data' {
  $body = '{"query":"{ searchMedicines(name: \"panadol\") { medicine { name } quantity status } }"}'
  $r = Invoke-RestMethod -Method Post $SearchUrl -Headers $auth -ContentType 'application/json' -Body $body
  $r.data.searchMedicines.Count -ge 1
}

$results | Format-Table -AutoSize
$failed = ($results | Where-Object { $_.Result -ne 'PASS' }).Count
Write-Host "`n$($results.Count - $failed)/$($results.Count) tests passed" -ForegroundColor $(if ($failed) { 'Red' } else { 'Green' })
