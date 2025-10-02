export interface HPData {
  qmMmr: number | string;
  slMmr: number | string;
  qmGames: number | string;
  slGames: number | string;
  url: string;
}

export interface HPSelectors {
  qmMmrSelector: string;
  slMmrSelector: string;
  gameTypeDropdown: string;
  qmGameTypeSelector: string;
  slGameTypeSelector: string;
  filterButton: string;
  winsSelector: string;
  lossesSelector: string;
  noDataSelector: string;
}
