param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DocumentName,
  [Parameter(Mandatory=$true)][string[]]$ImageFiles,
  [int]$Copies = 1
)

try {
  Add-Type -AssemblyName System.Drawing
  
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $PrinterName
  $pd.PrinterSettings.Copies = [int16]$Copies
  $pd.DocumentName = $DocumentName

  $script:pageIndex = 0
  $script:images = $ImageFiles

  $pd.add_PrintPage({
    param($sender, $e)
    if ($script:pageIndex -lt $script:images.Count) {
      $imgPath = $script:images[$script:pageIndex]
      $img = [System.Drawing.Image]::FromFile($imgPath)
      
      $pb = $e.PageBounds
      $e.Graphics.DrawImage($img, $pb.X, $pb.Y, $pb.Width, $pb.Height)
      $img.Dispose()
      
      $script:pageIndex++
      $e.HasMorePages = ($script:pageIndex -lt $script:images.Count)
    } else {
      $e.HasMorePages = $false
    }
  })

  $pd.Print()
  $pd.Dispose()
  Write-Host "SUCCESS: Spooled $DocumentName to $PrinterName"
} catch {
  Write-Error $_
  exit 1
}
