import type { ImageSourcePropType } from 'react-native';

const DEMO_PRODUCT_IMAGES: Record<string, ImageSourcePropType> = {
  SHOP_001_PROD_001: require('../assets/products/SHOP_001_PROD_001.png'),
  SHOP_001_PROD_002: require('../assets/products/SHOP_001_PROD_002.png'),
  SHOP_001_PROD_003: require('../assets/products/SHOP_001_PROD_003.png'),
  SHOP_001_PROD_004: require('../assets/products/SHOP_001_PROD_004.png'),
  SHOP_001_PROD_005: require('../assets/products/SHOP_001_PROD_005.png'),
  SHOP_001_PROD_006: require('../assets/products/SHOP_001_PROD_006.png'),
  SHOP_001_PROD_007: require('../assets/products/SHOP_001_PROD_007.png'),
  SHOP_001_PROD_008: require('../assets/products/SHOP_001_PROD_008.png'),
  SHOP_001_PROD_009: require('../assets/products/SHOP_001_PROD_009.png'),
  SHOP_001_PROD_010: require('../assets/products/SHOP_001_PROD_010.png'),
  SHOP_001_PROD_011: require('../assets/products/SHOP_001_PROD_011.png'),
  SHOP_001_PROD_012: require('../assets/products/SHOP_001_PROD_012.png'),
  SHOP_001_PROD_013: require('../assets/products/SHOP_001_PROD_013.png'),
  SHOP_001_PROD_014: require('../assets/products/SHOP_001_PROD_014.png'),
  SHOP_001_PROD_015: require('../assets/products/SHOP_001_PROD_015.png'),
};

const GENERIC_PRODUCT_IMAGE = require('../assets/products/generic-product.png');

export function productImageSource(image?: string, productId?: string): ImageSourcePropType {
  const value = image?.trim() ?? '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:image/')) return { uri: value };
  return DEMO_PRODUCT_IMAGES[value.toUpperCase()]
    ?? DEMO_PRODUCT_IMAGES[productId?.toUpperCase() ?? '']
    ?? GENERIC_PRODUCT_IMAGE;
}
