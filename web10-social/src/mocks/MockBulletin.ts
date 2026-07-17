import type { Bulletin } from '../types';

const mockBulletin: Bulletin[] = [
  {
    _id: '1',
    html: '<img src="/src/assets/images/brick.jpg" style="width:100%; height:300px; object-fit:cover;" />',
    height: '300px',
  },
  {
    _id: '2',
    html: '<img src="/src/assets/images/square.jpg" style="width:100%; height:200px; object-fit:cover;" />',
    height: '200px',
  },
  {
    _id: '3',
    html: '<img src="/src/assets/images/willy.jpg" style="width:100%; height:250px; object-fit:cover;" />',
    height: '250px',
  },
];

export default mockBulletin;
