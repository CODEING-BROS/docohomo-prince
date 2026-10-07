module.exports = {
  env: {
    PUBLIC_URL: "",
  },
  compiler: {
    removeConsole: true,
  },
  async redirects() {
    return [
      {
        source: '/shop/product/:id',
        destination: '/product/:id',
        permanent: true,
      },
      {
        source: '/shop/category/:id',
        destination: '/category/:id',
        permanent: true,
      },
      {
        source: '/shop/brands-wise/:id',
        destination: '/brands/:id',
        permanent: true,
      },
    ]
  },

};