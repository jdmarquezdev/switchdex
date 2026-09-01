export interface ExternalReviewLink {
  name: 'OpenCritic' | 'Metacritic';
  url: string;
}

export function createExternalReviewLinks(title: string): ExternalReviewLink[] {
  const encodedTitle = encodeURIComponent(title.trim());

  return [
    { name: 'OpenCritic', url: `https://opencritic.com/search?criteria=${encodedTitle}` },
    { name: 'Metacritic', url: `https://www.metacritic.com/search/${encodedTitle}/?category=13` }
  ];
}
