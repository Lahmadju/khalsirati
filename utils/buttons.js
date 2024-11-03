// Массив кнопок для каждой социальной сети
const socialNetworks = [
  { name: 'Telegram', url: 'https://t.me/khalsiratii', type: 'social' },
  { name: 'Instagram', url: 'https://instagram.com/khalsirati?igsh=MzRlODBiNWFlZA==', type: 'social' },
];

// Массив кнопок для каждой категории промокодов и скидок
const promoCodes = [
  { 
    name: 'Хиджаб: Основные требования', 
    url: 'https://telegra.ph/Hidzhab-osnovnye-trebovaniya-10-06',
    list: '', 
    description: 'Все о хиджабе, как правильное его носить и т.д', 
    author: 'Khalsirati',
    type: 'promo' 
  },
  { 
    name: 'Вабиль: Благодатный дождь', 
    url: 'https://www.wildberries.ru/catalog/17234603/detail.aspx',
    list: '432', 
    description: 'Книга, которая предлагается вашему вниманию, представляет собой послание великого учёного имама Ибн аль-Каййима одному из своих братьев по вере...', 
    author: 'Имам Ибн Каййим аль-Джаузийя',
    type: 'promo' 
  },
];

module.exports = { socialNetworks, promoCodes };