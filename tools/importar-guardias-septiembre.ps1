param(
  [string]$Archivo = (Join-Path $PSScriptRoot '..\TABLAS\guardias_septiembre_2026_extraidas.xlsx'),
  [string]$Datos = (Join-Path $PSScriptRoot '..\data\telefonos.json')
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Normalizar([string]$Texto) {
  $sinAcentos = $Texto.Normalize([Text.NormalizationForm]::FormD) -replace '[\p{Mn}]', ''
  return ($sinAcentos -replace '\s+', ' ').Trim().ToLowerInvariant()
}

function TelefonoPlano([string]$Telefono) {
  return ($Telefono -replace '\D', '')
}

function EsPersonaValida([string]$Persona, [string]$Servicio) {
  $nombre = Normalizar $Persona
  $servicioNormalizado = Normalizar $Servicio
  if (-not $nombre) { return $false }
  if ($nombre -match '^(hasta|hatsa|desde)\b') { return $false }
  if ($nombre -in @('laboratorio', 'emergencia', 'urgencia')) { return $false }
  return $nombre -ne $servicioNormalizado
}

if (-not (Test-Path $Archivo)) { throw "No existe la planilla: $Archivo" }
if (-not (Test-Path $Datos)) { throw "No existe la base de datos: $Datos" }

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $Archivo))
try {
  $entrada = $zip.GetEntry('xl/worksheets/sheet1.xml')
  $lector = [IO.StreamReader]::new($entrada.Open())
  [xml]$hoja = $lector.ReadToEnd()
  $lector.Close()
} finally {
  $zip.Dispose()
}

$espacios = [System.Xml.XmlNamespaceManager]::new($hoja.NameTable)
$espacios.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$filas = $hoja.SelectNodes('//x:sheetData/x:row', $espacios) | Select-Object -Skip 1
$registros = foreach ($fila in $filas) {
  $celdas = @{}
  foreach ($celda in $fila.SelectNodes('x:c', $espacios)) {
    $columna = ($celda.r -replace '\d', '')
    $nodoTexto = if ($celda.t -eq 'inlineStr') { $celda.SelectSingleNode('x:is/x:t', $espacios) } else { $celda.SelectSingleNode('x:v', $espacios) }
    $texto = if ($nodoTexto) { $nodoTexto.InnerText } else { '' }
    $celdas[$columna] = [string]$texto
  }
  if ($celdas.A -and $celdas.C -and $celdas.E) {
    [PSCustomObject]@{
      Fecha = $celdas.A.Trim()
      Servicio = $celdas.C.Trim()
      Turno = $celdas.D.Trim()
      Persona = $celdas.E.Trim()
      Telefono = $celdas.F.Trim()
      Observacion = $celdas.G.Trim()
    }
  }
}
$registros = @($registros | Where-Object { EsPersonaValida $_.Persona $_.Servicio })

$base = Get-Content $Datos -Raw | ConvertFrom-Json
if ($null -eq $base.PSObject.Properties['contactos_privados']) { $base | Add-Member -NotePropertyName contactos_privados -NotePropertyValue @() }
if ($null -eq $base.PSObject.Properties['guardias']) { $base | Add-Member -NotePropertyName guardias -NotePropertyValue @() }

$contactos = [System.Collections.ArrayList]::new()
$guardias = [System.Collections.ArrayList]@($base.guardias | Where-Object {
  $_.fecha -notlike '2026-09-*' -and (EsPersonaValida $_.contactoNombre $_.rolGuardia)
})
$indiceContactos = @{}
$reemplazosContactos = @{}
foreach ($contacto in @($base.contactos_privados | Where-Object { EsPersonaValida $_.nombre $_.rol })) {
  $clave = Normalizar $contacto.nombre
  $principal = $indiceContactos[$clave]
  if (-not $principal) {
    [void]$contactos.Add($contacto)
    $indiceContactos[$clave] = $contacto
  } else {
    if (-not (TelefonoPlano $principal.celularPrincipal) -and (TelefonoPlano $contacto.celularPrincipal)) {
      $principal.celularPrincipal = $contacto.celularPrincipal
    }
    $reemplazosContactos[$contacto.id] = $principal.id
  }
}
foreach ($guardia in $guardias) {
  if ($reemplazosContactos.ContainsKey($guardia.contactoId)) {
    $guardia.contactoId = $reemplazosContactos[$guardia.contactoId]
  }
}

$clavesGuardias = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($guardia in $guardias) {
  [void]$clavesGuardias.Add("$($guardia.fecha)|$($guardia.rolGuardia)|$($guardia.turno)|$($guardia.contactoNombre)|$($guardia.telefono)")
}

$funcionariosCreados = 0
$guardiasCreadas = 0
foreach ($registro in $registros) {
  $telefono = TelefonoPlano $registro.Telefono
  $claveContacto = Normalizar $registro.Persona
  $contacto = $indiceContactos[$claveContacto]
  if (-not $contacto) {
    $contacto = [PSCustomObject]@{
      id = [guid]::NewGuid().ToString()
      nombre = $registro.Persona
      ci = ''
      rol = $registro.Servicio
      funcion = $registro.Servicio
      celularPrincipal = $registro.Telefono
      celularSecundario = ''
      disponibilidad = 'Importado de guardias septiembre 2026'
    }
    [void]$contactos.Add($contacto)
    $indiceContactos[$claveContacto] = $contacto
    $funcionariosCreados++
  } elseif (-not (TelefonoPlano $contacto.celularPrincipal) -and $telefono) {
    $contacto.celularPrincipal = $registro.Telefono
  }

  $turno = if ($registro.Turno) { $registro.Turno } else { 'Guardia' }
  $claveGuardia = "$($registro.Fecha)|$($registro.Servicio)|$turno|$($registro.Persona)|$($registro.Telefono)"
  if ($clavesGuardias.Add($claveGuardia)) {
    [void]$guardias.Add([PSCustomObject]@{
      id = [guid]::NewGuid().ToString()
      fecha = $registro.Fecha
      turno = $turno
      rolGuardia = $registro.Servicio
      contactoId = $contacto.id
      contactoNombre = $registro.Persona
      telefono = $registro.Telefono
      notas = $registro.Observacion
    })
    $guardiasCreadas++
  }
}

$base.contactos_privados = @($contactos)
$base.guardias = @($guardias)
$base.version = [Math]::Max([int]$base.version, 217)
$base.actualizado = [DateTime]::UtcNow.ToString('o')

$carpetaRespaldos = Join-Path (Split-Path $Datos -Parent) 'respaldos'
New-Item -ItemType Directory -Force -Path $carpetaRespaldos | Out-Null
$marca = Get-Date -Format 'yyyy-MM-dd_HHmmss'
Copy-Item $Datos (Join-Path $carpetaRespaldos "antes-importar-guardias-$marca.json") -Force
$temporal = "$Datos.tmp"
[IO.File]::WriteAllText($temporal, ($base | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
Move-Item $temporal $Datos -Force

Write-Output "Importacion completada: registros=$($registros.Count) funcionarios_nuevos=$funcionariosCreados guardias_nuevas=$guardiasCreadas total_funcionarios=$($contactos.Count) total_guardias=$($guardias.Count)"