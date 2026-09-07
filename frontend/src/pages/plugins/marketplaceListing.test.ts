import { describe, expect, it } from 'vitest';

import type { CatalogListing } from '@/lib/api/plugins';

import {
  findInstalledPluginForListing,
  flattenMarketplaceListings,
  listingMatchesPlugin,
  listingsInMarketplaceTab,
  listingTopicCategory,
  marketplaceCategoryTabIds,
  pluginIdentitiesMatch,
} from './marketplaceListing';

function listing(
  owner: string,
  pluginName: string,
  category: string
): CatalogListing {
  return {
    owner,
    pluginName,
    tag: '1.0.0',
    version: '1.0.0',
    displayName: pluginName,
    summary: pluginName,
    category,
    sourceKind: 'official',
  };
}

describe('marketplace listing categories', () => {
  it('treats official as the cinyuverse owner and topics as real categories', () => {
    const session = listing('cinyuverse', 'cinyuverse.session-enhance', 'productivity');
    const notes = listing('acme', 'notes', 'community');
    const drawio = listing('cinyuverse', 'drawio', 'productivity');
    const listings = flattenMarketplaceListings([session], [notes, drawio]);

    expect(listingTopicCategory('official')).toBeNull();
    expect(listingTopicCategory('community')).toBeNull();
    expect(listingTopicCategory('productivity')).toBe('productivity');
    expect(marketplaceCategoryTabIds(listings)).toEqual([
      'all',
      'official',
      'productivity',
    ]);
    expect(
      listingsInMarketplaceTab(listings, 'official').map(
        (item) => item.pluginName
      )
    ).toEqual(['cinyuverse.session-enhance', 'drawio']);
    expect(
      listingsInMarketplaceTab(listings, 'productivity').map(
        (item) => item.pluginName
      )
    ).toEqual(['cinyuverse.session-enhance', 'drawio']);
    expect(
      listingsInMarketplaceTab(listings, 'all').map((item) => item.pluginName)
    ).toEqual(['cinyuverse.session-enhance', 'notes', 'drawio']);
  });
});

describe('marketplace installed matching', () => {
  it('treats publisher-prefixed and bare plugin ids as the same product', () => {
    expect(pluginIdentitiesMatch('office', 'cinyuverse.office')).toBe(true);
    expect(pluginIdentitiesMatch('cinyuverse.office', 'office')).toBe(true);
    expect(pluginIdentitiesMatch('cinyuverse.office', 'cinyuverse.office')).toBe(true);
    expect(pluginIdentitiesMatch('notes', 'cinyuverse.office')).toBe(false);
  });

  it('matches an installed catalog plugin to its marketplace listing', () => {
    expect(
      listingMatchesPlugin(
        { owner: 'cinyuverse', pluginName: 'cinyuverse.office' },
        { id: 'office', publisher: 'cinyuverse' }
      )
    ).toBe(true);
    expect(
      listingMatchesPlugin(
        { owner: 'cinyuverse', pluginName: 'cinyuverse.office' },
        { id: 'cinyuverse.office' }
      )
    ).toBe(true);
    expect(
      listingMatchesPlugin(
        {
          owner: 'acme',
          pluginName: 'notes',
          offlinePluginId: 'acme.notes',
        },
        { id: 'acme.notes' }
      )
    ).toBe(true);
    expect(
      listingMatchesPlugin(
        { owner: 'acme', pluginName: 'notes' },
        {
          id: 'journal',
          sourceOrigin: 'https://cinyuverse.xforever.xin/marketplace/acme/notes',
        }
      )
    ).toBe(true);
    expect(
      listingMatchesPlugin(
        { owner: 'acme', pluginName: 'notes' },
        { id: 'office', publisher: 'cinyuverse' }
      )
    ).toBe(false);
  });

  it('finds the installed plugin for a listing', () => {
    const office = { id: 'office', publisher: 'cinyuverse' };
    const notes = { id: 'notes', publisher: 'acme' };
    expect(
      findInstalledPluginForListing(
        { owner: 'cinyuverse', pluginName: 'cinyuverse.office' },
        [office, notes]
      )
    ).toBe(office);
    expect(
      findInstalledPluginForListing({ owner: 'acme', pluginName: 'notes' }, [
        office,
      ])
    ).toBeUndefined();
  });
});
