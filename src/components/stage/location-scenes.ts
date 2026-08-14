import locationAtlasDay from '../../assets/pixel/location-atlas-day.webp'
import locationAtlasDusk from '../../assets/pixel/location-atlas-dusk.webp'
import locationAtlasNight from '../../assets/pixel/location-atlas.webp'
import farmDay from '../../assets/pixel/farm-day.webp'
import farmDusk from '../../assets/pixel/farm-evening.webp'
import farmNight from '../../assets/pixel/farm-dusk.webp'
import hospitalDay from '../../assets/pixel/location-hospital-day.webp'
import hospitalDusk from '../../assets/pixel/location-hospital-dusk.webp'
import hospitalNight from '../../assets/pixel/location-hospital.webp'
import hunterCampDay from '../../assets/pixel/location-hunter-camp-day.webp'
import hunterCampDusk from '../../assets/pixel/location-hunter-camp-dusk.webp'
import hunterCampNight from '../../assets/pixel/location-hunter-camp.webp'
import libraryDay from '../../assets/pixel/location-library-day.webp'
import libraryDusk from '../../assets/pixel/location-library-dusk.webp'
import libraryNight from '../../assets/pixel/location-library.webp'
import mayorHomeDay from '../../assets/pixel/location-mayor-home-day.webp'
import mayorHomeDusk from '../../assets/pixel/location-mayor-home-dusk.webp'
import mayorHomeNight from '../../assets/pixel/location-mayor-home.webp'
import monsterMarketDay from '../../assets/pixel/location-monster-market-day.webp'
import monsterMarketDusk from '../../assets/pixel/location-monster-market-dusk.webp'
import monsterMarketNight from '../../assets/pixel/location-monster-market.webp'
import smithyDay from '../../assets/pixel/location-smithy-day.webp'
import smithyDusk from '../../assets/pixel/location-smithy-dusk.webp'
import smithyNight from '../../assets/pixel/location-smithy.webp'
import type { LocationId } from '../../game/types'
import { resolveSceneAsset, type SceneAssetSet } from '../../visual/scene-lighting'

const atlasBackgrounds: SceneAssetSet = { day: locationAtlasDay, dusk: locationAtlasDusk, night: locationAtlasNight }

export const locationBackgrounds: Partial<Record<LocationId, SceneAssetSet>> = {
  farm: { day: farmDay, dusk: farmDusk, night: farmNight },
  'mayor-home': { day: mayorHomeDay, dusk: mayorHomeDusk, night: mayorHomeNight },
  smithy: { day: smithyDay, dusk: smithyDusk, night: smithyNight },
  'monster-market': { day: monsterMarketDay, dusk: monsterMarketDusk, night: monsterMarketNight },
  'hunter-camp': { day: hunterCampDay, dusk: hunterCampDusk, night: hunterCampNight },
  library: { day: libraryDay, dusk: libraryDusk, night: libraryNight },
  hospital: { day: hospitalDay, dusk: hospitalDusk, night: hospitalNight },
}

export function getLocationSceneAssets(locationId: LocationId): SceneAssetSet {
  return locationBackgrounds[locationId] ?? atlasBackgrounds
}

export function getLocationBackground(locationId: LocationId, minutes: number): string {
  return resolveSceneAsset(getLocationSceneAssets(locationId), minutes)
}

export function hasCustomLocationBackground(locationId: LocationId): boolean {
  return Boolean(locationBackgrounds[locationId])
}
