import Contacts from './components/Contacts/Contacts';
import Chat from './components/Chat/Chat';
import Bio from './components/Bio/Bio';
import StandAloneFeed from './components/Feed/StandAloneFeed';
import Login from './components/Login/Login';
import useInterface from './interfaces/Interface';
import useMockInterface from './interfaces/MockInterface';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import './components/Components.css';

function App() {
  const queryParameters = new URLSearchParams(window.location.search);
  const mock = queryParameters.get('mock');
  const mockI = useMockInterface();
  const realI = useInterface();
  const I = mock ? mockI : realI;
  window.I = I;

  switch (I.mode) {
    case 'chat':
    case 'chat-edit':
      return <Chat I={I} />;
    case 'bio':
    case 'my-bio':
    case 'bio-edit':
    case 'bulletin-edit':
      return <Bio I={I} />;
    case 'feed':
      return <StandAloneFeed I={I} />;
    case 'login':
      return <Login I={I} />;
    default:
      return <Contacts I={I} />;
  }
}

export default App;
