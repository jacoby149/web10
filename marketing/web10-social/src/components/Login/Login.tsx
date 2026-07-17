import { R, C } from 'rectangles-npm';
import type { AppInterface } from '../../types';
import '../Components.css';

function Login({ I }: { I: AppInterface }) {
  return (
    <R root t bt bb br bl onClick={I.toggleTheme} theme={I.theme}>
      <C va="center" ha="center" t tel>
        <div style={{ textAlign: 'center' }}>
          <b>Welcome To Web10 Social!</b>
          <br />
          <br />
          <button onClick={I.login} className="button is-primary">
            Log In
          </button>
        </div>
      </C>
    </R>
  );
}

export default Login;
