export type InteriorArtworkKind = 'store' | 'freedom' | 'docs' | 'appearance'

function StoreArtwork() {
  return <>
    <path className="intro-art-faint" d="M20 136 166 64l174 47M20 100 166 27l174 47M89 166l147-74M229 170l89-45" />
    <path className="intro-art-face" d="m57 92 51-26 51 26-51 26z M57 92v28l51 26 51-26V92m-51 26v28" />
    <path className="intro-art-face" d="m169 98 56-29 57 29-57 29z M169 98v31l56 29 57-29V98m-57 29v31" />
    <path className="intro-art-glint" d="m119 64 62-32 63 32-63 32z M119 64v24l62 32 63-32V64m-63 32v24" />
    <path d="m144 64 37-19 37 19-37 19z M168 64l13 7 13-7 M278 53l19-10 19 10-19 10z" />
    <path className="intro-art-faint" d="M57 128v18m51 8v15m117-7v12m57-37v17M181 19V7m117 28V22" />
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
