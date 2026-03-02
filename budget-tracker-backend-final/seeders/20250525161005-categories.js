'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const defaultCategories = [
      {
        name: 'Gaji',
        description: 'Penghasilan dari pekerjaan tetap',
      },
      {
        name: 'Makanan & Minuman',
        description: 'Belanja makan harian dan jajan',
      },
      {
        name: 'Transportasi',
        description: 'Ongkos transportasi dan bahan bakar',
      },
      {
        name: 'Tempat Tinggal',
        description: 'Sewa, listrik, dan air',
      },
      {
        name: 'Hiburan',
        description: 'Streaming, game, atau liburan',
      },
      {
        name: 'Belanja',
        description: 'Belanja pakaian dan kebutuhan pribadi',
      },
      {
        name: 'Freelance',
        description: 'Penghasilan dari pekerjaan lepas',
      },
      {
        name: 'Pendidikan',
        description: 'Buku dan biaya kursus',
      },
      {
        name: 'Investasi',
        description: 'Dana untuk saham atau reksadana',
      },
      {
        name: 'Donasi',
        description: 'Zakat dan sumbangan sosial',
      },
      {
        name: 'Lainnya',
        description: 'Kategori tidak terdefinisi',
      },
    ];

    const [existingRows] = await queryInterface.sequelize.query(
      'SELECT name FROM categories'
    );
    const existingNames = new Set((existingRows || []).map((row) => row.name));

    const now = new Date();
    const categoriesToInsert = defaultCategories
      .filter((category) => !existingNames.has(category.name))
      .map((category) => ({
        ...category,
        created_at: now,
        updated_at: now,
      }));

    if (categoriesToInsert.length === 0) {
      return;
    }

    await queryInterface.bulkInsert('categories', categoriesToInsert);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('categories', {
      name: [
        'Gaji',
        'Makanan & Minuman',
        'Transportasi',
        'Tempat Tinggal',
        'Hiburan',
        'Belanja',
        'Freelance',
        'Pendidikan',
        'Investasi',
        'Donasi',
        'Lainnya',
      ],
    });
  }
};
