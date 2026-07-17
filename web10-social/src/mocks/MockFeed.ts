import type { Post } from '../types';

const mockFeed: Post[] = [
  {
    _id: '1',
    html: '<p>Just got back from a great hike! The views were amazing.</p>',
    media: [
      { type: 'image', src: '/src/assets/images/waterfall.jpg' },
    ],
    time: new Date(2024, 5, 15, 10, 30).toLocaleTimeString(),
    web10: 'api.web10.app/emily511',
  },
  {
    _id: '2',
    html: '<p>Working on some exciting new projects. Stay tuned!</p>',
    media: [],
    time: new Date(2024, 5, 14, 14, 0).toLocaleTimeString(),
    web10: 'api.web10.app/jacoby149',
  },
  {
    _id: '3',
    html: '<p>Beautiful sunset tonight.</p>',
    media: [
      { type: 'image', src: '/src/assets/images/pond.jpg' },
    ],
    time: new Date(2024, 5, 13, 19, 45).toLocaleTimeString(),
    web10: 'api.web10.app/emily511',
  },
  {
    _id: '4',
    html: '<p>Check out this cool video I made!</p>',
    media: [
      { type: 'video', src: '/src/assets/videos/Future.mp4' },
    ],
    time: new Date(2024, 5, 12, 16, 20).toLocaleTimeString(),
    web10: 'api.web10.app/jacoby149',
  },
  {
    _id: '5',
    html: '<p>Having a great time at the conference!</p>',
    media: [
      { type: 'image', src: '/src/assets/images/bridge.jpg' },
    ],
    time: new Date(2024, 5, 11, 11, 15).toLocaleTimeString(),
    web10: 'api.web10.app/emily511',
  },
];

export default mockFeed;
