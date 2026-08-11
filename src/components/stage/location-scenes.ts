import locationAtlas from '../../assets/pixel/location-atlas.webp'
import farmBackground from '../../assets/pixel/farm-dusk.webp'
import hospitalBackground from '../../assets/pixel/location-hospital.webp'
import hunterCampBackground from '../../assets/pixel/location-hunter-camp.webp'
import libraryBackground from '../../assets/pixel/location-library.webp'
import mayorHomeBackground from '../../assets/pixel/location-mayor-home.webp'
import monsterMarketBackground from '../../assets/pixel/location-monster-market.webp'
import smithyBackground from '../../assets/pixel/location-smithy.webp'
import type { LocationId } from '../../game/types'

export const locationBackgrounds: Partial<Record<LocationId, string>> = {
  farm: farmBackground,
  'mayor-home': mayorHomeBackground,
  smithy: smithyBackground,
  'monster-market': monsterMarketBackground,
  'hunter-camp': hunterCampBackground,
  library: libraryBackground,
  hospital: hospitalBackground,
}

export function getLocationBackground(locationId: LocationId): string {
  return locationBackgrounds[locationId] ?? locationAtlas
}

export function hasCustomLocationBackground(locationId: LocationId): boolean {
  return Boolean(locationBackgrounds[locationId])
}
