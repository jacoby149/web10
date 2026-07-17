import type { Message } from '../types';

const mockChat: Message[] = [
  { message: 'Hello my friend', sentTime: String(new Date(2024, 5, 10, 9, 0)), web10: 'api.web10.app/emily511', direction: 'in' },
  { message: 'Hey! How are you?', sentTime: String(new Date(2024, 5, 10, 9, 1)), web10: 'api.web10.app/jacoby149', direction: 'out' },
  { message: 'Im doing great! Just finished a project.', sentTime: String(new Date(2024, 5, 10, 9, 5)), web10: 'api.web10.app/emily511', direction: 'in' },
  { message: 'Thats awesome! What kind of project?', sentTime: String(new Date(2024, 5, 10, 9, 6)), web10: 'api.web10.app/jacoby149', direction: 'out' },
  { message: 'A social media app on web10!', sentTime: String(new Date(2024, 5, 10, 9, 10)), web10: 'api.web10.app/emily511', direction: 'in' },
  { message: 'Oh nice! Id love to check it out.', sentTime: String(new Date(2024, 5, 10, 9, 12)), web10: 'api.web10.app/jacoby149', direction: 'out' },
  { message: 'Sure! Ill send you the link later.', sentTime: String(new Date(2024, 5, 10, 9, 15)), web10: 'api.web10.app/emily511', direction: 'in' },
  { message: 'Sounds good! Cant wait to see it.', sentTime: String(new Date(2024, 5, 10, 9, 16)), web10: 'api.web10.app/jacoby149', direction: 'out' },
  { message: 'By the way, are you coming to the meetup next week?', sentTime: String(new Date(2024, 5, 10, 9, 20)), web10: 'api.web10.app/emily511', direction: 'in' },
  { message: 'Yes! Definitely. Should be a great event.', sentTime: String(new Date(2024, 5, 10, 9, 22)), web10: 'api.web10.app/jacoby149', direction: 'out' },
  { message: 'Awesome! See you there then!', sentTime: String(new Date(2024, 5, 10, 9, 25)), web10: 'api.web10.app/emily511', direction: 'in' },
  { message: 'See you! 👋', sentTime: String(new Date(2024, 5, 10, 9, 26)), web10: 'api.web10.app/jacoby149', direction: 'out' },
];

export default mockChat;
