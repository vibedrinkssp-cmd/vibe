DELETE FROM public.geocoding_cache
WHERE (6371 * acos(
  cos(radians(-23.1791)) * cos(radians(latitude)) *
  cos(radians(longitude) - radians(-45.8872)) +
  sin(radians(-23.1791)) * sin(radians(latitude))
)) > 30;