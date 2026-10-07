// component
import Iconify from '../../components/Iconify';

// ----------------------------------------------------------------------

const getIcon = (name) => <Iconify icon={name} width={22} height={22} />;

const navConfig = [
  // {
  //   title: 'dashboard',
  //   path: '/dashboard/app',
  //   icon: getIcon('eva:pie-chart-2-fill'),
  // },
  {
    title: 'orders',
    path: '/dashboard/orders',
    icon: getIcon('bxs:box'),
  },
  {
    title: 'Users',
    path: '/dashboard/users',
    icon: getIcon('eva:people-fill'),
  },
  // {
  //   title: 'vendors',
  //   path: '/dashboard/vendor',
  //   icon: getIcon('entypo:shop'),
  // },
  {
    title: 'Brands',
    path: '/dashboard/brands',
    icon: getIcon('material-symbols:shopping-basket-sharp'),
  },
  {
    title: 'Categories',
    path: '/dashboard/categories',
    icon: getIcon('material-symbols:category-rounded'),
  },
  {
    title: 'Coupons',
    path: '/dashboard/coupons',
    icon: getIcon('solar:bill-list-bold'),
  },
  {
    title: 'Products',
    path: '/dashboard/products',
    icon: getIcon('eva:shopping-bag-fill'),
  },
  {
    title: 'banners',
    path: '/dashboard/banners',
    icon: getIcon('eva:image-fill'),
  },
  {
    title: 'mobile banners',
    path: '/dashboard/mobilebanners',
    icon: getIcon('eva:image-fill'),
  },
  {
    title: 'Available Doctors',
    path: '/dashboard/available-doctors',
    icon: getIcon('fa6-solid:user-doctor'),
  },
  {
    title: ' Doctor Enquiries',
    path: '/dashboard/doctor-enquiries',
    icon: getIcon('mdi:message-bookmark'),
  },
  {
    title: ' Wholesale Enquiries',
    path: '/dashboard/wholesale-enquiries',
    icon: getIcon('fa-solid:boxes'),
  },
  {
    title: 'Delivery Charges',
    path: '/dashboard/delivery',
    icon: getIcon('mdi:delivery-dining'),
  },
  {
    title: 'blog categories',
    path: '/dashboard/blogs_categories',
    icon: getIcon('eva:file-text-fill'),
  },
  {
    title: 'blogs',
    path: '/dashboard/blogs',
    icon: getIcon('eva:file-text-fill'),
  },
  // {
  //   title: 'blog',
  //   path: '/dashboard/blog',
  //   icon: getIcon('eva:file-text-fill'),
  // },

];

export default navConfig;
