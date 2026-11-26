export type InteriorArtworkKind = 'store' | 'freedom' | 'docs' | 'appearance'

function StoreArtwork() {
  return <>
    <path className="intro-art-faint" d="M27 48h306M27 118h306M75 22v142m105-154v152M285 22v142M44 155h68m136 0h68" />
    <path d="M82 89v14a8 8 0 0 0 8 8h180a8 8 0 0 0 8-8V89M180 80v47" />
    <rect className="intro-art-face" x="43" y="35" width="78" height="54" rx="6" />
    <rect className="intro-art-glint" x="137" y="23" width="86" height="57" rx="6" />
    <rect className="intro-art-face" x="239" y="35" width="78" height="54" rx="6" />
    <path d="M43 49h78m16-11h86m16 11h78M53 42h2m5 0h2m85-11h2m5 0h2m93 11h2m5 0h2M65 62h34M65 69h25m-25 7h30m181-16v16m-8-12v8m16-11v14m8-9v4" />
    <path d="M175 48v20l16-10z" />
    <circle className="intro-art-glint" cx="180" cy="111" r="4" />
    <rect className="intro-art-glint" x="130" y="127" width="100" height="31" rx="9" />
    <path d="M175 142.5a6 6 0 1 0-12 0 6 6 0 0 0 12 0zm0 0h24m-5 0v6m-8-6v4M141 142.5h10m58 0h10" />
  </>
}

function FreedomArtwork() {
  return <>
    <path className="intro-art-faint" d="M28 39h304M28 142h304M180 12v152M103 30v121m154-121v121" />
    <path d="M58 47h33l23 24h21M58 90h77M58 133h33l23-24h21M302 47h-33l-23 24h-21m77 19h-77m77 43h-33l-23-24h-21" />
    <path className="intro-art-face" d="M40 38h18v18H40z M40 81h18v18H40z M40 124h18v18H40z M302 38h18v18h-18z M302 81h18v18h-18z M302 124h18v18h-18z" />
    <rect className="intro-art-face" x="135" y="48" width="90" height="84" rx="9" />
    <path d="M146 59h68v62h-68z" />
    <path className="intro-art-glint" d="M169 83v-6a11 11 0 0 1 22 0v6m-27 0h32v25h-32z M180 93v7" />
  </>
}

function DocsArtwork() {
  return <>
    <path className="intro-art-faint" d="M35 32h290M35 151h290M104 16v150m150-150v150M63 100h235" />
    <path className="intro-art-face" d="M70 67c39-15 74-14 109 10 36-24 72-25 111-10v62c-39-15-75-11-111 14-35-25-70-29-109-14z" />
    <path className="intro-art-glint" d="M81 48c35-12 68-8 98 17 30-25 64-29 100-17v75c-36-12-70-8-100 16-30-24-63-28-98-16zm98 17v74" />
    <path d="M97 63c23-5 46 0 65 13m-65 0c23-5 46 0 65 13m-65 0c23-5 46 0 65 13m34-26c19-13 42-18 65-13m-65 26c19-13 42-18 65-13m-65 26c12-8 25-12 39-14" />
    <path className="intro-art-glint" d="M228 116v23l12-8 12 4v-26z" />
  </>
}

function AppearanceArtwork() {
  return <>
    <path className="intro-art-faint" d="M20 89h320M180 9v160M61 35h238M61 144h238" />
    <ellipse className="intro-art-faint" cx="180" cy="89" rx="137" ry="56" transform="rotate(-17 180 89)" />
    <path className="intro-art-face" d="M180 31a58 58 0 0 1 0 116z" />
    <path className="intro-art-glint" d="M180 31a58 58 0 0 0 0 116z" />
    <path d="M180 41a48 48 0 0 0 0 96m0-86a38 38 0 0 0 0 76m0-66a28 28 0 0 0 0 56m0-46a18 18 0 0 0 0 36" />
    <circle className="intro-art-glint" cx="278" cy="47" r="7" />
    <circle cx="75" cy="125" r="4" />
    <path d="M83 45h14m-7-7v14m182 77h16m-8-8v16m-70-47h13m-6.5-6.5v13" />
  </>
}

const artwork = { store: StoreArtwork, freedom: FreedomArtwork, docs: DocsArtwork, appearance: AppearanceArtwork }

export default function InteriorArtwork({ kind }: { kind: InteriorArtworkKind }) {
  const Scene = artwork[kind]
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 360 180" className="interior-intro-art" data-artwork={kind}>
      <Scene />
    </svg>
  )
}
