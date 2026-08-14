import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const roots = [
  ['village-map.webp', 'village-map-day.webp', 'village-map-dusk.webp'],
  ['farm-dusk.webp', 'farm-day.webp', 'farm-evening.webp'],
  ['location-atlas.webp', 'location-atlas-day.webp', 'location-atlas-dusk.webp'],
  ['location-hospital.webp', 'location-hospital-day.webp', 'location-hospital-dusk.webp'],
  ['location-hunter-camp.webp', 'location-hunter-camp-day.webp', 'location-hunter-camp-dusk.webp'],
  ['location-library.webp', 'location-library-day.webp', 'location-library-dusk.webp'],
  ['location-mayor-home.webp', 'location-mayor-home-day.webp', 'location-mayor-home-dusk.webp'],
  ['location-monster-market.webp', 'location-monster-market-day.webp', 'location-monster-market-dusk.webp'],
  ['location-smithy.webp', 'location-smithy-day.webp', 'location-smithy-dusk.webp'],
]

function readUint24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function webpDimensions(path) {
  const buffer = readFileSync(path)
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error(`Invalid WebP container: ${path}`)
  }

  let offset = 12
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const payload = offset + 8
    if (type === 'VP8X') {
      return [readUint24LE(buffer, payload + 4) + 1, readUint24LE(buffer, payload + 7) + 1]
    }
    if (type === 'VP8L') {
      const bits = buffer.readUInt32LE(payload + 1)
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
    }
    if (type === 'VP8 ') {
      if (buffer[payload + 3] !== 0x9d || buffer[payload + 4] !== 0x01 || buffer[payload + 5] !== 0x2a) {
        throw new Error(`Invalid VP8 frame header: ${path}`)
      }
      return [buffer.readUInt16LE(payload + 6) & 0x3fff, buffer.readUInt16LE(payload + 8) & 0x3fff]
    }
    offset = payload + size + (size % 2)
  }
  throw new Error(`WebP dimensions not found: ${path}`)
}

for (const group of roots) {
  let expected
  for (const name of group) {
    const path = resolve('src/assets/pixel', name)
    if (!existsSync(path)) throw new Error(`Missing scene asset: ${name}`)
    const dimensions = webpDimensions(path)
    expected ??= dimensions
    if (dimensions[0] !== expected[0] || dimensions[1] !== expected[1]) {
      throw new Error(`Mismatched scene dimensions in ${group.join(', ')}: ${name} is ${dimensions.join('x')}, expected ${expected.join('x')}`)
    }
  }
}

console.log(`Validated ${roots.length} scene families and ${roots.length * 3} references at matching dimensions.`)
