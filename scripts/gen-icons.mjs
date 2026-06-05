import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg192 = readFileSync('public/icon-192.svg')
const svg512 = readFileSync('public/icon-512.svg')

await sharp(svg192).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(svg512).resize(512, 512).png().toFile('public/icon-512.png')
console.log('Icons generated')
