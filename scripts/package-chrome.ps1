param(
  [string]$OutputPath
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $projectRoot "manifest.json"
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $projectRoot "dist\ntu-course-priority-$version-chrome.zip"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $projectRoot $OutputPath
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

if (Test-Path -LiteralPath $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Force
}

# The source key preserves the existing Edge/unpacked development ID. Chrome
# Web Store packages intentionally omit it so the store owns the Chrome item ID.
$manifest.PSObject.Properties.Remove("key")
$manifestJson = $manifest | ConvertTo-Json -Depth 100

$packageFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@(
  $manifest.action.default_popup,
  "popup.css",
  "popup.js",
  "demo.html",
  "demo.css",
  "demo-native.js",
  "demo-runtime.js"
) | ForEach-Object {
  if (-not [string]::IsNullOrWhiteSpace($_)) {
    [void]$packageFiles.Add($_)
  }
}

$manifest.icons.PSObject.Properties.Value | ForEach-Object { [void]$packageFiles.Add($_) }
$manifest.action.default_icon.PSObject.Properties.Value | ForEach-Object { [void]$packageFiles.Add($_) }
$manifest.content_scripts | ForEach-Object {
  @($_.js) + @($_.css) | ForEach-Object {
    if (-not [string]::IsNullOrWhiteSpace($_)) {
      [void]$packageFiles.Add($_)
    }
  }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
  $OutputPath,
  [System.IO.Compression.ZipArchiveMode]::Create
)

try {
  $manifestEntry = $archive.CreateEntry("manifest.json", [System.IO.Compression.CompressionLevel]::Optimal)
  $manifestStream = $manifestEntry.Open()
  try {
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    $writer = [System.IO.StreamWriter]::new($manifestStream, $utf8WithoutBom)
    try {
      $writer.Write($manifestJson)
    } finally {
      $writer.Dispose()
    }
  } finally {
    $manifestStream.Dispose()
  }

  foreach ($relativePath in $packageFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      throw "Required package file does not exist: $relativePath"
    }

    $entryPath = $relativePath.Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $sourcePath,
      $entryPath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

$checkArchive = [System.IO.Compression.ZipFile]::OpenRead($OutputPath)
try {
  $manifestEntry = $checkArchive.GetEntry("manifest.json")
  if ($null -eq $manifestEntry) {
    throw "The package does not contain manifest.json at the ZIP root."
  }

  $reader = [System.IO.StreamReader]::new($manifestEntry.Open(), [System.Text.Encoding]::UTF8)
  try {
    $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json
  } finally {
    $reader.Dispose()
  }

  if ($null -ne $packagedManifest.PSObject.Properties["key"]) {
    throw "The Chrome package unexpectedly contains a manifest key."
  }
} finally {
  $checkArchive.Dispose()
}

Write-Output "Created Chrome Web Store package: $OutputPath"
Write-Output "Chrome package version: $version"
Write-Output "Packaged manifest key: omitted (Chrome Web Store will assign the item ID)"
