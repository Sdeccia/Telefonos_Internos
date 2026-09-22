Add-Type -AssemblyName System.Drawing

$origen = Join-Path $PSScriptRoot '..\Logo hospital julio.jpeg'
$destino = Join-Path $PSScriptRoot '..\public\logo-hospital.png'
$imagen = [System.Drawing.Bitmap]::new($origen)

try {
  for ($y = 0; $y -lt $imagen.Height; $y++) {
    for ($x = 0; $x -lt $imagen.Width; $x++) {
      $pixel = $imagen.GetPixel($x, $y)
      $maximo = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
      $minimo = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
      if (($maximo - $minimo) -le 14 -and $maximo -ge 180) {
        $imagen.SetPixel($x, $y, [System.Drawing.Color]::White)
      }
    }
  }
  $imagen.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $imagen.Dispose()
}

Write-Output "Logo generado: $destino"