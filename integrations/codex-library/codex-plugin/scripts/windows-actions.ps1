param()
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($request.action -eq 'locale') {
  Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class ProcedureLanguage { [DllImport("kernel32.dll")] public static extern ushort GetUserDefaultUILanguage(); }'
  @{ langid = [ProcedureLanguage]::GetUserDefaultUILanguage() } | ConvertTo-Json -Compress
  exit 0
}
$target = [IO.Path]::GetFullPath([string]$request.path)
if ($request.action -eq 'open') {
  if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw 'Directory not found.' }
  Start-Process -FilePath explorer.exe -ArgumentList ('"' + $target + '"') -WindowStyle Hidden
  @{ opened = $true } | ConvertTo-Json -Compress
  exit 0
}
if ($request.action -ne 'recycle') { throw 'Unknown action.' }
$item = Get-Item -LiteralPath $target -Force
if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Only a regular file may be recycled.' }
$drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($target))
if ($drive.DriveType -ne [IO.DriveType]::Fixed) { throw 'A local fixed drive is required.' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ProcedureRecycle {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Operation {
  public IntPtr hwnd; public uint wFunc; public string pFrom; public string pTo; public ushort fFlags;
  [MarshalAs(UnmanagedType.Bool)] public bool aborted; public IntPtr mappings; public string title;
 }
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)] public static extern int SHFileOperationW(ref Operation operation);
 public static int Recycle(string path, out bool aborted) {
  Operation operation = new Operation(); operation.wFunc=3; operation.pFrom=path+"\0\0";
  operation.fFlags=0x0040|0x0010|0x4000|0x0004;
  int result=SHFileOperationW(ref operation); aborted=operation.aborted; return result;
 }
}
'@
$aborted = $false
$result = [ProcedureRecycle]::Recycle($target, [ref]$aborted)
if ($result -ne 0 -or $aborted -or (Test-Path -LiteralPath $target)) { throw "Recycle incomplete: code=$result aborted=$aborted" }
@{ recycled = $true; path = $target } | ConvertTo-Json -Compress
