import type { Identity } from '../types';

const defaultIdentity = (web10: string): Identity => ({
  web10,
  pic: '/alternative.png',
  name: web10.split('/')[1] ?? web10,
  bio: 'Hey there, I am using web10 social!',
});

export default defaultIdentity;
