/**
 * Nationality, as football-data.org writes it, to the FIFA trigram a card prints
 * ("Norway" → "NOR"). Covers every nationality in the six competitions' squads plus the
 * rest of FIFA's members that turn up in European football, with football-data's own
 * spellings as aliases ("Korea, South", "Cape Verde Islands", "Turkiye"). Anything
 * missing falls back to its first three letters, upper-cased.
 */

const FIFA: Record<string, string> = {
  Afghanistan: 'AFG', Albania: 'ALB', Algeria: 'ALG', Andorra: 'AND', Angola: 'ANG', 'Antigua and Barbuda': 'ATG',
  Argentina: 'ARG', Armenia: 'ARM', Aruba: 'ARU', Australia: 'AUS', Austria: 'AUT', Azerbaijan: 'AZE',
  Bahrain: 'BHR', Bangladesh: 'BAN', Barbados: 'BRB', Belarus: 'BLR', Belgium: 'BEL', Belize: 'BLZ', Benin: 'BEN',
  Bermuda: 'BER', Bolivia: 'BOL', 'Bosnia-Herzegovina': 'BIH', 'Bosnia and Herzegovina': 'BIH', Botswana: 'BOT',
  Brazil: 'BRA', Bulgaria: 'BUL', 'Burkina Faso': 'BFA', Burundi: 'BDI', Cambodia: 'CAM', Cameroon: 'CMR',
  Canada: 'CAN', 'Cape Verde': 'CPV', 'Cape Verde Islands': 'CPV', 'Cabo Verde': 'CPV', 'Central African Republic': 'CTA',
  Chad: 'CHA', Chile: 'CHI', China: 'CHN', 'China PR': 'CHN', Colombia: 'COL', Comoros: 'COM', Congo: 'CGO',
  'Congo DR': 'COD', 'DR Congo': 'COD', 'Democratic Republic of the Congo': 'COD', 'Costa Rica': 'CRC',
  Croatia: 'CRO', Cuba: 'CUB', Curaçao: 'CUW', Curacao: 'CUW', Cyprus: 'CYP', 'Czech Republic': 'CZE', Czechia: 'CZE',
  Denmark: 'DEN', Djibouti: 'DJI', 'Dominican Republic': 'DOM', Ecuador: 'ECU', Egypt: 'EGY', 'El Salvador': 'SLV',
  England: 'ENG', 'Equatorial Guinea': 'EQG', Eritrea: 'ERI', Estonia: 'EST', Eswatini: 'SWZ', Ethiopia: 'ETH',
  'Faroe Islands': 'FRO', Fiji: 'FIJ', Finland: 'FIN', France: 'FRA', 'French Guiana': 'GUF', Gabon: 'GAB',
  Gambia: 'GAM', 'The Gambia': 'GAM', Georgia: 'GEO', Germany: 'GER', Ghana: 'GHA', Gibraltar: 'GIB', Greece: 'GRE',
  Grenada: 'GRN', Guadeloupe: 'GLP', Guatemala: 'GUA', Guinea: 'GUI', 'Guinea-Bissau': 'GNB', Guyana: 'GUY',
  Haiti: 'HAI', Honduras: 'HON', 'Hong Kong': 'HKG', Hungary: 'HUN', Iceland: 'ISL', India: 'IND', Indonesia: 'IDN',
  Iran: 'IRN', Iraq: 'IRQ', Ireland: 'IRL', 'Republic of Ireland': 'IRL', Israel: 'ISR', Italy: 'ITA',
  'Ivory Coast': 'CIV', "Côte d'Ivoire": 'CIV', 'Côte d’Ivoire': 'CIV', Jamaica: 'JAM', Japan: 'JPN', Jordan: 'JOR',
  Kazakhstan: 'KAZ', Kenya: 'KEN', Kosovo: 'KVX', Kuwait: 'KUW', Kyrgyzstan: 'KGZ', Latvia: 'LVA', Lebanon: 'LBN',
  Liberia: 'LBR', Libya: 'LBY', Liechtenstein: 'LIE', Lithuania: 'LTU', Luxembourg: 'LUX', Madagascar: 'MAD',
  Malawi: 'MWI', Malaysia: 'MAS', Mali: 'MLI', Malta: 'MLT', Martinique: 'MTQ', Mauritania: 'MTN', Mauritius: 'MRI',
  Mexico: 'MEX', Moldova: 'MDA', Montenegro: 'MNE', Montserrat: 'MSR', Morocco: 'MAR', Mozambique: 'MOZ',
  Namibia: 'NAM', Netherlands: 'NED', 'New Caledonia': 'NCL', 'New Zealand': 'NZL', Nicaragua: 'NCA', Niger: 'NIG',
  Nigeria: 'NGA', 'North Korea': 'PRK', 'Korea, North': 'PRK', 'Korea DPR': 'PRK', 'North Macedonia': 'MKD',
  Macedonia: 'MKD', 'Northern Ireland': 'NIR', Norway: 'NOR', Oman: 'OMA', Pakistan: 'PAK', Palestine: 'PLE',
  Panama: 'PAN', 'Papua New Guinea': 'PNG', Paraguay: 'PAR', Peru: 'PER', Philippines: 'PHI', Poland: 'POL',
  Portugal: 'POR', 'Puerto Rico': 'PUR', Qatar: 'QAT', Réunion: 'REU', Romania: 'ROU', Russia: 'RUS', Rwanda: 'RWA',
  'Saint Kitts and Nevis': 'SKN', 'Saint Lucia': 'LCA', 'San Marino': 'SMR', 'São Tomé and Príncipe': 'STP',
  'Saudi Arabia': 'KSA', Scotland: 'SCO', Senegal: 'SEN', Serbia: 'SRB', Seychelles: 'SEY', 'Sierra Leone': 'SLE',
  Singapore: 'SIN', Slovakia: 'SVK', Slovenia: 'SVN', Somalia: 'SOM', 'South Africa': 'RSA', 'South Korea': 'KOR',
  'Korea, South': 'KOR', 'Korea Republic': 'KOR', 'South Sudan': 'SSD', Spain: 'ESP', 'Sri Lanka': 'SRI', Sudan: 'SDN',
  Suriname: 'SUR', Sweden: 'SWE', Switzerland: 'SUI', Syria: 'SYR', Tahiti: 'TAH', Taiwan: 'TPE', Tajikistan: 'TJK',
  Tanzania: 'TAN', Thailand: 'THA', Togo: 'TOG', 'Trinidad and Tobago': 'TRI', Tunisia: 'TUN', Turkey: 'TUR',
  Turkiye: 'TUR', Türkiye: 'TUR', Turkmenistan: 'TKM', Uganda: 'UGA', Ukraine: 'UKR', 'United Arab Emirates': 'UAE',
  USA: 'USA', 'United States': 'USA', Uruguay: 'URU', Uzbekistan: 'UZB', Venezuela: 'VEN', Vietnam: 'VIE',
  Wales: 'WAL', Yemen: 'YEM', Zambia: 'ZAM', Zimbabwe: 'ZIM',
};

/** The FIFA trigram for a football-data nationality; falls back to its first three letters. */
export function nationCode(nationality: string | null | undefined): string | null {
  if (!nationality) return null;
  const n = nationality.trim();
  const hit = FIFA[n];
  if (hit) return hit;
  const letters = n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 3).toUpperCase() || null;
}
