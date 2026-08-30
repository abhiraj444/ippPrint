param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DocumentName,
  [string]$ImageFolder,
  [string[]]$ImageFiles,
  [int]$Copies = 1
)

try {
  Add-Type -AssemblyName System.Drawing

  if ($ImageFolder -and (Test-Path $ImageFolder)) {
    $resolvedImages = Get-ChildItem -Path $ImageFolder -Filter "page_*.png" | Sort-Object Name | ForEach-Object { $_.FullName }
  } elseif ($ImageFiles) {
    $resolvedImages = $ImageFiles | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim('"').Trim("'") } | Where-Object { $_ -and (Test-Path $_) }
  }

  if (-not $resolvedImages -or $resolvedImages.Count -eq 0) {
    throw "No valid image files found to print."
  }

  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $PrinterName
  $pd.PrinterSettings.Copies = [int16]$Copies
  $pd.DocumentName = $DocumentName

  $script:pageIndex = 0
  $script:images = @($resolvedImages)

  $pd.add_PrintPage({
    param($sender, $e)
    if ($script:pageIndex -lt $script:images.Count) {
      $imgPath = $script:images[$script:pageIndex]
      $img = [System.Drawing.Image]::FromFile($imgPath)
      
      $pb = $e.PageBounds
      
      $hRes = if ($img.HorizontalResolution -gt 0) { $img.HorizontalResolution } else { 150 }
      $vRes = if ($img.VerticalResolution -gt 0) { $img.VerticalResolution } else { 150 }
      
      # Natural image dimensions in 1/100 inch (PageBounds units)
      $imgW = ($img.Width / $hRes) * 100.0
      $imgH = ($img.Height / $vRes) * 100.0
      
      # Shrink-to-fit only if larger than page bounds; keep 100% original size if smaller
      $scaleW = if ($imgW -gt $pb.Width) { $pb.Width / $imgW } else { 1.0 }
      $scaleH = if ($imgH -gt $pb.Height) { $pb.Height / $imgH } else { 1.0 }
      $fitScale = [Math]::Min($scaleW, $scaleH)
      
      $drawW = $imgW * $fitScale
      $drawH = $imgH * $fitScale
      $drawX = $pb.X + ($pb.Width - $drawW) / 2.0
      $drawY = $pb.Y + ($pb.Height - $drawH) / 2.0
      
      $e.Graphics.DrawImage($img, [float]$drawX, [float]$drawY, [float]$drawW, [float]$drawH)
      $img.Dispose()
      
      $script:pageIndex++
      $e.HasMorePages = ($script:pageIndex -lt $script:images.Count)
    } else {
      $e.HasMorePages = $false
    }
  })

  $pd.Print()
  $pd.Dispose()
  Write-Host "SUCCESS: Spooled $DocumentName ($($script:images.Count) pages) to $PrinterName"
} catch {
  Write-Error $_
  exit 1
}
