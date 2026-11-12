import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import '../src/index.css';
import Layout from '@/components/Social/Layout';
import HashtagScreen from '@/components/Discover/HashtagScreen';
import { PostBody, PostBodyInline } from '@/components/Feed/PostBody';
import { MarkdownText } from '../../shared/discover/src/MarkdownText';
import { defaultHashtagHref } from '../../shared/discover/src/hashtags';
import { ComposerProvider } from '@/context/ComposerContext';
import { RepostProvider } from '@/context/RepostContext';
import { SaveProvider } from '@/context/SaveContext';
import { NewPostSheet } from '@/components/Feed/NewPostSheet';
import { getThemeStore } from '@/lib/theme';

getThemeStore();
function Sources() {
  const navigate = useNavigate();
  return <section className="mx-auto max-w-2xl space-y-6 p-6" data-testid="hashtag-source">
    <h1 className="font-display text-2xl text-foreground">A topic starts with a post.</h1>
    <PostBody text="A little fresh air. #Walking" />
    <PostBody text="A light caption. #Walking" density="light" />
    <PostBodyInline text="An inline caption. #Walking" />
    <div><MarkdownText text="A comment. #Walking" hashtagHref={defaultHashtagHref} onHashtagClick={tag => navigate(`/tag/${tag}`)} /></div>
    <Link to="/tag/new_topic" className="inline-block text-brand-300 hover:underline">An empty topic</Link>
  </section>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><RepostProvider><ComposerProvider><SaveProvider>
  <Routes><Route element={<Layout onLogout={() => {}} onLogin={() => {}} isAnon={new URLSearchParams(location.search).has('anon')} />}>
    <Route path="/tag/:hashtag" element={<HashtagScreen />} />
    <Route path="*" element={<Sources />} />
  </Route></Routes><NewPostSheet />
</SaveProvider></ComposerProvider></RepostProvider></BrowserRouter>);
