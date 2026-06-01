from __future__ import annotations

SEARCH_SHOWS_QUERY = """
query( $search: SearchInput $limit: Int $page: Int
       $translationType: VaildTranslationTypeEnumType
       $countryOrigin: VaildCountryOriginEnumType ) {
  shows( search: $search limit: $limit page: $page
         translationType: $translationType countryOrigin: $countryOrigin ) {
    edges {
      _id name englishName altNames description genres thumbnail banner
      type availableEpisodesDetail __typename
    }
  }
}
"""

SHOW_DETAILS_QUERY = """
query ($id: String!) {
  show(_id: $id) {
    _id
    name
    englishName
    altNames
    description
    genres
    banner
    thumbnail
    type
    relatedShows
    availableEpisodesDetail
  }
}
"""

EPISODE_LIST_QUERY = """
query ($id: String!) {
  show(_id: $id) {
    availableEpisodesDetail
  }
}
"""

EPISODE_METADATA_QUERY = """
query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
  episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
    episodeString
    sourceUrls
  }
}
"""
