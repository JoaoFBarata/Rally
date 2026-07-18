import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';

async function main() {
  const files = fs.readdirSync('./good_icons').filter(f => f.endsWith('.png'));
  for (const file of files) {
    const image = await Jimp.read(path.join('./good_icons', file));
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = image.getPixelColor(x, y);
        const a = color & 0xff;
        if (a > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    const w = maxX >= minX ? maxX - minX + 1 : 0;
    const h = maxY >= minY ? maxY - minY + 1 : 0;
    console.log(`${file}: size=${width}x${height}, contentBox=(${minX}, ${minY}) -> (${maxX}, ${maxY}) width=${w}, height=${h}`);
  }
}

main().catch(console.error);
