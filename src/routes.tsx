import { Icon } from '@chakra-ui/react';
import {
  MdPerson,
  MdHome,
  MdOutlineShoppingCart,
  MdSchool,
  MdFace,
  MdFaceRetouchingNatural,
  MdSettings,
} from 'react-icons/md';

// Admin Imports
// import MainDashboard from './pages/admin/default';
// import NFTMarketplace from './pages/admin/nft-marketplace';
// import Profile from './pages/admin/profile';
// import DataTables from './pages/admin/data-tables';
// import RTL from './pages/rtl/rtl-default';

// Auth Imports
// import SignInCentered from './pages/auth/sign-in';
import { IRoute } from 'types/navigation';

const routes: IRoute[] = [
  {
    name: 'Dashboard',
    layout: '/admin',
    path: '/dashboard',
    icon: <Icon as={MdHome} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Overview',
    layout: '/admin',
    path: '/default',
    icon: <Icon as={MdSchool} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'NFT Marketplace',
    layout: '/admin',
    path: '/nft-marketplace',
    icon: (
      <Icon
        as={MdOutlineShoppingCart}
        width="20px"
        height="20px"
        color="inherit"
      />
    ),
    secondary: true,
  },
  {
    name: 'Students',
    layout: '/admin',
    icon: <Icon as={MdPerson} width="20px" height="20px" color="inherit" />,
    path: '/data-tables',
  },
  {
    name: 'Unknown Faces',
    layout: '/admin',
    path: '/unknown-faces',
    icon: <Icon as={MdFace} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Face',
    layout: '/admin',
    path: '/face',
    icon: <Icon as={MdFaceRetouchingNatural} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Demo Setup',
    layout: '/admin',
    path: '/demo-setup',
    icon: <Icon as={MdSettings} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Profile',
    layout: '/admin',
    path: '/profile',
    icon: <Icon as={MdPerson} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'RTL Admin',
    layout: '/rtl',
    path: '/rtl-default',
    icon: <Icon as={MdHome} width="20px" height="20px" color="inherit" />,
  },
];

export default routes;
