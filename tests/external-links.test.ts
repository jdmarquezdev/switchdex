import { describe, expect, it } from 'vitest';
import { createExternalReviewLinks } from '../src/data/external-links';

describe('external review links', () => {
  it('codifica el título y limita Metacritic a su categoría de juegos', () => {
    expect(createExternalReviewLinks('Mario + Rabbids: Sparks of Hope')).toEqual([
      {
        name: 'OpenCritic',
        url: 'https://opencritic.com/search?criteria=Mario%20%2B%20Rabbids%3A%20Sparks%20of%20Hope'
      },
      {
        name: 'Metacritic',
        url: 'https://www.metacritic.com/search/Mario%20%2B%20Rabbids%3A%20Sparks%20of%20Hope/?category=13'
      }
    ]);
  });
});
