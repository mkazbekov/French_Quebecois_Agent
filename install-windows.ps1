# One-line installer for people who don't use Git or a terminal normally:
#
#   irm https://raw.githubusercontent.com/mkazbekov/French_Quebecois_Agent/main/install-windows.ps1 | iex
#
# Downloads the repo, installs it to a normal-looking folder, creates a
# Desktop + Start Menu shortcut, unblocks everything (a ZIP downloaded via a
# browser or Invoke-WebRequest carries the Mark-of-the-Web "Internet zone"
# flag, which Windows 11 Smart App Control uses to outright block a .bat
# extracted from it - Unblock-File removes that flag), and starts the tutor.
#
# Must run on both Windows PowerShell 5.1 (the OS default) and PowerShell 7 -
# no ternary operator, no null-coalescing (??), no multi-arg Join-Path.
#
# Everything lives inside Install-Tutor, called only on the very last line:
# PowerShell must parse this whole file (matching braces) before it can call
# the function, so a connection that drops partway through a `irm | iex`
# download can never run half a script.

function Install-Tutor {
  # TLS 1.2: Windows PowerShell 5.1 sometimes defaults to an older protocol
  # that GitHub's servers refuse. Harmless to set again on PS7.
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch {
    # Ignore - if this fails, the download attempt below will just fail with its own clear error.
  }
  # Invoke-WebRequest renders a progress bar that is extremely slow on
  # Windows PowerShell 5.1's console host. We don't need it.
  $ProgressPreference = 'SilentlyContinue'

  try {
    $archiveUrl = $env:TUTOR_ARCHIVE_URL
    if (-not $archiveUrl) {
      $archiveUrl = 'https://github.com/mkazbekov/French_Quebecois_Agent/archive/refs/heads/main.zip'
    }
    $installDir = $env:TUTOR_INSTALL_DIR
    if (-not $installDir) {
      $installDir = Join-Path $HOME 'Quebec French Tutor'
    }

    # An update replaces this folder's contents wholesale (see below), so
    # never accept a folder that holds anything else.
    $installDirTrimmed = $installDir.TrimEnd('\')
    $forbidden = New-Object System.Collections.Generic.List[string]
    $forbidden.Add($HOME.TrimEnd('\'))
    $forbidden.Add((Join-Path $HOME 'Desktop').TrimEnd('\'))
    $forbidden.Add((Join-Path $HOME 'Documents').TrimEnd('\'))
    $forbidden.Add((Join-Path $HOME 'Downloads').TrimEnd('\'))
    try { $forbidden.Add(([Environment]::GetFolderPath('Desktop')).TrimEnd('\')) } catch {}
    try { $forbidden.Add(([Environment]::GetFolderPath('MyDocuments')).TrimEnd('\')) } catch {}
    $isDriveRoot = $installDirTrimmed -match '^[A-Za-z]:$'
    $isForbidden = $false
    foreach ($f in $forbidden) {
      if ($f -and ($installDirTrimmed -ieq $f)) { $isForbidden = $true }
    }
    if ($isDriveRoot -or $isForbidden -or [string]::IsNullOrWhiteSpace($installDirTrimmed)) {
      throw "Refusing to install into `"$installDir`". Set `$env:TUTOR_INSTALL_DIR to a dedicated folder."
    }

    Write-Host ""
    Write-Host "== Quebec French Voice Tutor - installer ==" -ForegroundColor Cyan
    Write-Host ""

    $tmpDir = Join-Path $env:TEMP ("tutor-install-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    try {
      Write-Host "Downloading the tutor..."
      $archivePath = Join-Path $tmpDir 'source.zip'
      if (Test-Path -LiteralPath $archiveUrl -PathType Leaf) {
        # A local path (only used for testing: TUTOR_ARCHIVE_URL=C:\...\main.zip).
        Copy-Item -LiteralPath $archiveUrl -Destination $archivePath -Force
      } else {
        try {
          Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath -UseBasicParsing
        } catch {
          throw "Could not download the tutor. Check your internet connection and try again."
        }
      }

      Write-Host "Extracting..."
      try {
        Expand-Archive -LiteralPath $archivePath -DestinationPath $tmpDir -Force
      } catch {
        throw "Could not extract the downloaded file. It may be corrupted - try again."
      }
      $extracted = Get-ChildItem -LiteralPath $tmpDir -Directory | Select-Object -First 1
      if (-not $extracted) {
        throw "The downloaded archive did not contain a folder - something is wrong with the download."
      }

      # If this is an update (the install folder already exists), keep the
      # learner's saved key, progress, downloaded Node.js, and installed
      # dependencies - only the app code itself gets replaced.
      $keepDir = $null
      if (Test-Path -LiteralPath $installDir) {
        Write-Host "Found an existing install - updating it and keeping your saved settings and progress..."
        $keepDir = Join-Path $tmpDir 'keep'
        New-Item -ItemType Directory -Path $keepDir -Force | Out-Null
        foreach ($item in @('.env', 'data', '.runtime', 'node_modules')) {
          $src = Join-Path $installDir $item
          if (Test-Path -LiteralPath $src) {
            Move-Item -LiteralPath $src -Destination (Join-Path $keepDir $item) -Force
          }
        }
        Remove-Item -LiteralPath $installDir -Recurse -Force
      } else {
        Write-Host "Installing to `"$installDir`"..."
      }

      $parentDir = Split-Path -Parent $installDir
      if ($parentDir -and -not (Test-Path -LiteralPath $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
      }
      Move-Item -LiteralPath $extracted.FullName -Destination $installDir

      if ($keepDir -and (Test-Path -LiteralPath $keepDir)) {
        foreach ($item in @('.env', 'data', '.runtime', 'node_modules')) {
          $src = Join-Path $keepDir $item
          if (Test-Path -LiteralPath $src) {
            $dst = Join-Path $installDir $item
            if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
            Move-Item -LiteralPath $src -Destination $dst
          }
        }
      }
    } finally {
      Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $batPath = Join-Path $installDir 'Start Tutor (Windows).bat'
    if (-not (Test-Path -LiteralPath $batPath)) {
      throw "Something is wrong with the download: $batPath was not found."
    }

    # Belt-and-braces: Expand-Archive carries the ZIP's Mark-of-the-Web onto
    # every extracted file, and Smart App Control blocks a .bat with that
    # flag outright ("An Application Control policy has blocked this
    # file..."). Skip node_modules/.runtime - large, and never re-downloaded
    # by us so they're already unblocked (or came from npm, never marked).
    Get-ChildItem -LiteralPath $installDir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\\.runtime\\' } |
      Unblock-File -ErrorAction SilentlyContinue

    # Desktop + Start Menu shortcuts, so the learner never has to find this
    # folder or open a terminal again. $env:TUTOR_SHORTCUT_DIR overrides both
    # (used only by this script's own tests, so they don't touch the real
    # Desktop/Start Menu).
    if ($env:TUTOR_SHORTCUT_DIR) {
      $desktopDir = $env:TUTOR_SHORTCUT_DIR
      $startMenuDir = $env:TUTOR_SHORTCUT_DIR
      New-Item -ItemType Directory -Path $desktopDir -Force | Out-Null
    } else {
      $desktopDir = [Environment]::GetFolderPath('Desktop')
      $startMenuDir = [Environment]::GetFolderPath('Programs')
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcutTargets = New-Object System.Collections.Generic.List[string]
    $shortcutTargets.Add((Join-Path $desktopDir 'Quebec French Tutor.lnk'))
    if ($startMenuDir -ne $desktopDir) {
      $shortcutTargets.Add((Join-Path $startMenuDir 'Quebec French Tutor.lnk'))
    }
    # shell32.dll icon 13: a globe - fits a language/world-languages tutor.
    $iconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',13'
    foreach ($lnkPath in $shortcutTargets) {
      try {
        $lnkDir = Split-Path -Parent $lnkPath
        if (-not (Test-Path -LiteralPath $lnkDir)) { New-Item -ItemType Directory -Path $lnkDir -Force | Out-Null }
        $shortcut = $shell.CreateShortcut($lnkPath)
        $shortcut.TargetPath = $batPath
        $shortcut.WorkingDirectory = $installDir
        $shortcut.IconLocation = $iconLocation
        $shortcut.Description = 'Practice spoken Quebec French with the voice tutor'
        $shortcut.Save()
      } catch {
        Write-Host "Could not create a shortcut at $lnkPath - you can still open `"$batPath`" directly." -ForegroundColor Yellow
      }
    }

    Write-Host ""
    Write-Host "Done:"
    Write-Host "  - Installed to: $installDir"
    Write-Host "  - Shortcut created: Quebec French Tutor"
    Write-Host ""
    Write-Host "The tutor is starting in a new window. Next time, just double-click `"Quebec French Tutor`" on your Desktop."

    Start-Process -FilePath $batPath -WorkingDirectory $installDir | Out-Null
  } catch {
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    return
  }
}

Install-Tutor
