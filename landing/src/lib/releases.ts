export interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
  content_type: string
}

export interface YankRelease {
  version: string
  published_at: string
  html_url: string
  assets: ReleaseAsset[]
}

const GITHUB_API = 'https://api.github.com/repos/piyushpradhan/recall/releases/latest'
const GITHUB_RELEASES = 'https://github.com/piyushpradhan/recall/releases/latest'

let cachedRelease: YankRelease | null = null

function assetFor(assets: ReleaseAsset[], patterns: RegExp[]): ReleaseAsset | null {
  for (const pattern of patterns) {
    const match = assets.find((a) => pattern.test(a.name))
    if (match) return match
  }
  return null
}

export async function getLatestRelease(): Promise<{
  release: YankRelease | null
  downloads: {
    windows: { url: string; label: string; arch: string } | null
    macos: { url: string; label: string; arch: string } | null
    linux: { url: string; label: string; arch: string } | null
  }
}> {
  if (!cachedRelease) {
    try {
      const res = await fetch(GITHUB_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'yank-landing' },
        // revalidate at most every 5 minutes during dev
        ...(process.env.NODE_ENV === 'development' ? {} : { next: { revalidate: 300 } }),
      })
      if (res.ok) {
        cachedRelease = (await res.json()) as YankRelease
      }
    } catch {
      // API unavailable; fall back to generic release page
    }
  }

  const assets = cachedRelease?.assets ?? []
  const fallbackUrl = cachedRelease?.html_url ?? GITHUB_RELEASES

  const windowsAsset = assetFor(assets, [
    /x64-setup\.exe$/i,
    /x64_en-US\.msi$/i,
    /\.exe$/i,
  ])
  const macosDmg = assetFor(assets, [/aarch64\.dmg$/i, /arm64\.dmg$/i, /x64\.dmg$/i, /\.dmg$/i])
  const linuxAppImage = assetFor(assets, [/amd64\.AppImage$/i, /x86_64\.AppImage$/i, /\.AppImage$/i])
  const linuxDeb = assetFor(assets, [/amd64\.deb$/i, /x86_64\.deb$/i])

  return {
    release: cachedRelease,
    downloads: {
      windows: windowsAsset
        ? { url: windowsAsset.browser_download_url, label: `${formatSize(windowsAsset.size)} · .exe installer`, arch: 'x64' }
        : { url: fallbackUrl, label: 'x64 · NSIS installer', arch: 'x64' },
      macos: macosDmg
        ? {
            url: macosDmg.browser_download_url,
            label: `${formatSize(macosDmg.size)} · .dmg`,
            arch: macosDmg.name.toLowerCase().includes('aarch64') || macosDmg.name.toLowerCase().includes('arm64') ? 'Apple Silicon' : 'Intel',
          }
        : { url: fallbackUrl, label: 'Apple Silicon / Intel · .dmg', arch: 'Universal' },
      linux: linuxAppImage
        ? { url: linuxAppImage.browser_download_url, label: `${formatSize(linuxAppImage.size)} · AppImage`, arch: 'x64' }
        : linuxDeb
          ? { url: linuxDeb.browser_download_url, label: `${formatSize(linuxDeb.size)} · .deb`, arch: 'x64' }
          : { url: fallbackUrl, label: 'x64 · AppImage / .deb', arch: 'x64' },
    },
  }
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}
