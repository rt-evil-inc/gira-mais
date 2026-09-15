import type { knownErrors } from './api';

export type ThrownError = {
	errors: {message:keyof typeof knownErrors | (string & {})}[];
	status: number;
};
export type Q<T extends (keyof Query)[]> = {[K in T[number]]:Query[K]};
export type M<T extends (keyof Mutation)[]> = {[K in T[number]]:Mutation[K]};

export type Maybe<T> = T | null
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K]
}
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  { [SubKey in K]?: Maybe<T[SubKey]> }
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> &
  { [SubKey in K]: Maybe<T[SubKey]> }
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string
  String: string
  Boolean: boolean
  Int: number
  Float: number
  /** The `DateTime` scalar type represents a date and time. `DateTime` expects timestamps to be formatted in accordance with the [ISO-8601](https://en.wikipedia.org/wiki/ISO_8601) standard. */
  DateTime: any
  Byte: any
}

export type Query = {
  __typename?: 'Query'
  getStations?: Maybe<Array<Maybe<StationInfo>>>
  getDocks?: Maybe<Array<Maybe<Dock>>>
  getBikes?: Maybe<Array<Maybe<Bike>>>
  getSubscriptions?: Maybe<Array<Maybe<SubscriptionDetail>>>
  canPayTripWithPoints?: Maybe<CanPayTripWithPoints_Out>
  getTrip?: Maybe<Array<Maybe<Trip>>>
  activeTrip?: Maybe<Trip>
  unratedTrips?: Maybe<Array<Maybe<Trip>>>
  tripHistory?: Maybe<Array<Maybe<TripHistory_TripDetail>>>
  activeTripCost?: Maybe<Scalars['Float']>
  activeSubscriptions?: Maybe<Array<Maybe<UserSubscription>>>
  activeUserSubscriptions?: Maybe<Array<Maybe<ActiveUserSubscriptions_Out>>>
  inactiveSubscriptions?: Maybe<Array<Maybe<UserSubscription>>>
  paidSubscriptions?: Maybe<Array<Maybe<UserSubscription>>>
  newPaidSubscriptions?: Maybe<Array<Maybe<UserSubscriptionDetail>>>
  newPendingPaymentSubscriptions?: Maybe<Array<Maybe<UserSubscriptionDetail>>>
  subscriptionHistory?: Maybe<Array<Maybe<SubscriptionHistory_Out>>>
  subscriptionGeneratePayPalBondToken?: Maybe<
    SubscriptionGeneratePayPalBondToken_Out
  >
  getCreditCards?: Maybe<Array<Maybe<GetCreditCards_Out>>>
  getServerTime?: Maybe<Scalars['DateTime']>
  serviceStatus?: Maybe<Scalars['Boolean']>
  generatePayPalToken?: Maybe<GeneratePayPalToken_Out>
  getPayPalAccountDetails?: Maybe<GetPayPalAccountDetails_Out>
  bankReference?: Maybe<Array<Maybe<BankReference>>>
  client?: Maybe<Array<Maybe<Client>>>
  clientCreditCard?: Maybe<Array<Maybe<ClientCreditCard>>>
  invoice?: Maybe<Array<Maybe<Invoice>>>
  promotionInstance?: Maybe<Array<Maybe<PromotionInstance>>>
  transaction?: Maybe<Array<Maybe<Transaction>>>
}

export type QueryGetDocksArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryGetBikesArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryCanPayTripWithPointsArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryGetTripArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryUnratedTripsArgs = {
  pageInput?: Maybe<PageInput>
}

export type QueryTripHistoryArgs = {
  pageInput?: Maybe<PageInput>
}

export type QuerySubscriptionHistoryArgs = {
  pageInput?: Maybe<PageInput>
}

export type QuerySubscriptionGeneratePayPalBondTokenArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryGetCreditCardsArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryGetPayPalAccountDetailsArgs = {
  input?: Maybe<Scalars['String']>
}

export type QueryBankReferenceArgs = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
  _sort?: Maybe<Array<Maybe<SortRule>>>
  client?: Maybe<Scalars['String']>
  amount?: Maybe<Scalars['Float']>
}

export type QueryClientArgs = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
  _sort?: Maybe<Array<Maybe<SortRule>>>
  code?: Maybe<Scalars['String']>
}

export type QueryClientCreditCardArgs = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
  _sort?: Maybe<Array<Maybe<SortRule>>>
}

export type QueryInvoiceArgs = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
  _sort?: Maybe<Array<Maybe<SortRule>>>
  client?: Maybe<Scalars['String']>
}

export type QueryPromotionInstanceArgs = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
  _sort?: Maybe<Array<Maybe<SortRule>>>
  minAmount?: Maybe<Scalars['Float']>
  dateGreater?: Maybe<Scalars['DateTime']>
  active?: Maybe<Scalars['Boolean']>
}

export type QueryTransactionArgs = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
  _sort?: Maybe<Array<Maybe<SortRule>>>
  client?: Maybe<Scalars['String']>
  transactionType?: Maybe<Scalars['String']>
}

export type StationInfo = {
  __typename?: 'StationInfo'
  dockList?: Maybe<Array<Maybe<Dock>>>
  docks?: Maybe<Scalars['Int']>
  bikes?: Maybe<Scalars['Int']>
  stype?: Maybe<Scalars['String']>
  serialNumber?: Maybe<Scalars['String']>
  assetType?: Maybe<Scalars['String']>
  assetStatus?: Maybe<Scalars['String']>
  assetCondition?: Maybe<Scalars['String']>
  parent?: Maybe<Scalars['String']>
  warehouse?: Maybe<Scalars['String']>
  zone?: Maybe<Scalars['String']>
  location?: Maybe<Scalars['String']>
  latitude?: Maybe<Scalars['Float']>
  longitude?: Maybe<Scalars['Float']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Dock = {
  __typename?: 'Dock'
  ledStatus?: Maybe<Scalars['String']>
  lockStatus?: Maybe<Scalars['String']>
  serialNumber?: Maybe<Scalars['String']>
  assetType?: Maybe<Scalars['String']>
  assetStatus?: Maybe<Scalars['String']>
  assetCondition?: Maybe<Scalars['String']>
  parent?: Maybe<Scalars['String']>
  warehouse?: Maybe<Scalars['String']>
  zone?: Maybe<Scalars['String']>
  location?: Maybe<Scalars['String']>
  latitude?: Maybe<Scalars['Float']>
  longitude?: Maybe<Scalars['Float']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Bike = {
  __typename?: 'Bike'
  type?: Maybe<Scalars['String']>
  kms?: Maybe<Scalars['String']>
  battery?: Maybe<Scalars['String']>
  serialNumber?: Maybe<Scalars['String']>
  assetType?: Maybe<Scalars['String']>
  assetStatus?: Maybe<Scalars['String']>
  assetCondition?: Maybe<Scalars['String']>
  parent?: Maybe<Scalars['String']>
  warehouse?: Maybe<Scalars['String']>
  zone?: Maybe<Scalars['String']>
  location?: Maybe<Scalars['String']>
  latitude?: Maybe<Scalars['Float']>
  longitude?: Maybe<Scalars['Float']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type SubscriptionDetail = {
  __typename?: 'SubscriptionDetail'
  code?: Maybe<Scalars['String']>
  type?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  englishName?: Maybe<Scalars['String']>
  englishDescription?: Maybe<Scalars['String']>
  activationCost?: Maybe<Scalars['Float']>
  subscriptionCost?: Maybe<Scalars['Float']>
  subscriptionPeriod?: Maybe<Scalars['Int']>
  activationBonus?: Maybe<Scalars['Float']>
  message?: Maybe<Scalars['String']>
  bond?: Maybe<Scalars['Float']>
  periods?: Maybe<Array<Maybe<SubscriptionDetail_Period>>>
  paymentTypes?: Maybe<Array<Maybe<Scalars['String']>>>
}

export type SubscriptionDetail_Period = {
  __typename?: 'SubscriptionDetail_Period'
  timeValue?: Maybe<Scalars['Float']>
  classicValue?: Maybe<Scalars['Float']>
  electricValue?: Maybe<Scalars['Float']>
}

export type CanPayTripWithPoints_Out = {
  __typename?: 'CanPayTripWithPoints_Out'
  canPayWithMoney?: Maybe<Scalars['Boolean']>
  canUsePoints?: Maybe<Scalars['Boolean']>
  clientPoints?: Maybe<Scalars['Int']>
  tripCost?: Maybe<Scalars['Float']>
}

export type Trip = {
  __typename?: 'Trip'
  user?: Maybe<Scalars['String']>
  asset?: Maybe<Scalars['String']>
  startDate?: Maybe<Scalars['DateTime']>
  endDate?: Maybe<Scalars['DateTime']>
  startLocation?: Maybe<Scalars['String']>
  endLocation?: Maybe<Scalars['String']>
  distance?: Maybe<Scalars['Float']>
  rating?: Maybe<Scalars['Int']>
  photo?: Maybe<Scalars['String']>
  cost?: Maybe<Scalars['Float']>
  startOccupation?: Maybe<Scalars['Float']>
  endOccupation?: Maybe<Scalars['Float']>
  totalBonus?: Maybe<Scalars['Int']>
  client?: Maybe<Scalars['String']>
  costBonus?: Maybe<Scalars['Int']>
  comment?: Maybe<Scalars['String']>
  compensationTime?: Maybe<Scalars['Boolean']>
  endTripDock?: Maybe<Scalars['String']>
  tripStatus?: Maybe<Scalars['String']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type PageInput = {
  _pageNum?: Maybe<Scalars['Int']>
  _pageSize?: Maybe<Scalars['Int']>
}

export type TripHistory_TripDetail = {
  __typename?: 'TripHistory_TripDetail'
  code?: Maybe<Scalars['String']>
  startDate?: Maybe<Scalars['DateTime']>
  endDate?: Maybe<Scalars['DateTime']>
  rating?: Maybe<Scalars['Int']>
  bikeName?: Maybe<Scalars['String']>
  startLocation?: Maybe<Scalars['String']>
  endLocation?: Maybe<Scalars['String']>
  bonus?: Maybe<Scalars['Int']>
  usedPoints?: Maybe<Scalars['Int']>
  cost?: Maybe<Scalars['Float']>
  bikeType?: Maybe<Scalars['String']>
}

export type UserSubscription = {
  __typename?: 'UserSubscription'
  user?: Maybe<Scalars['String']>
  client?: Maybe<Scalars['String']>
  subscription?: Maybe<Scalars['String']>
  activationDate?: Maybe<Scalars['DateTime']>
  active?: Maybe<Scalars['Boolean']>
  cost?: Maybe<Scalars['Float']>
  expirationDate?: Maybe<Scalars['DateTime']>
  type?: Maybe<SubscriptionType>
  subscriptionStatus?: Maybe<Scalars['String']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type SubscriptionType = {
  __typename?: 'SubscriptionType'
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type ActiveUserSubscriptions_Out = {
  __typename?: 'ActiveUserSubscriptions_Out'
  code?: Maybe<Scalars['String']>
  cost?: Maybe<Scalars['Float']>
  expirationDate?: Maybe<Scalars['DateTime']>
  subscriptionStatus?: Maybe<Scalars['String']>
  nameEnglish?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  subscriptionCost?: Maybe<Scalars['Float']>
  subscriptionPeriod?: Maybe<Scalars['Int']>
  subscription?: Maybe<Scalars['String']>
  type?: Maybe<Scalars['String']>
  active?: Maybe<Scalars['Boolean']>
}

export type UserSubscriptionDetail = {
  __typename?: 'UserSubscriptionDetail'
  subscriptionValues?: Maybe<Subscriptions>
  user?: Maybe<Scalars['String']>
  client?: Maybe<Scalars['String']>
  subscription?: Maybe<Scalars['String']>
  activationDate?: Maybe<Scalars['DateTime']>
  active?: Maybe<Scalars['Boolean']>
  cost?: Maybe<Scalars['Float']>
  expirationDate?: Maybe<Scalars['DateTime']>
  type?: Maybe<SubscriptionType>
  subscriptionStatus?: Maybe<Scalars['String']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Subscriptions = {
  __typename?: 'Subscriptions'
  activationCost?: Maybe<Scalars['Float']>
  subscriptionCost?: Maybe<Scalars['Float']>
  banner?: Maybe<Scalars['String']>
  active?: Maybe<Scalars['Boolean']>
  subscriptionPeriod?: Maybe<Scalars['Int']>
  activationBonus?: Maybe<Scalars['Float']>
  type?: Maybe<SubscriptionType>
  englishName?: Maybe<Scalars['String']>
  englishDescription?: Maybe<Scalars['String']>
  subscriptionOrder?: Maybe<Scalars['Int']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type SubscriptionHistory_Out = {
  __typename?: 'SubscriptionHistory_Out'
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
  user?: Maybe<Scalars['String']>
  client?: Maybe<Scalars['String']>
  subscription?: Maybe<Scalars['String']>
  subscriptionValues?: Maybe<Subscriptions>
  activationDate?: Maybe<Scalars['DateTime']>
  active?: Maybe<Scalars['Boolean']>
  cost?: Maybe<Scalars['Float']>
  expirationDate?: Maybe<Scalars['DateTime']>
  type?: Maybe<SubscriptionType>
  subscriptionStatus?: Maybe<Scalars['String']>
  transactionId?: Maybe<Scalars['String']>
  released?: Maybe<Scalars['Boolean']>
  releaseDate?: Maybe<Scalars['DateTime']>
  ccReleaseDate?: Maybe<Scalars['DateTime']>
  authorizationId?: Maybe<Scalars['String']>
}

export type SubscriptionGeneratePayPalBondToken_Out = {
  __typename?: 'SubscriptionGeneratePayPalBondToken_Out'
  token?: Maybe<Scalars['String']>
  url?: Maybe<Scalars['String']>
  returnUrl?: Maybe<Scalars['String']>
  cancelUrl?: Maybe<Scalars['String']>
}

export type GetCreditCards_Out = {
  __typename?: 'GetCreditCards_Out'
  code?: Maybe<Scalars['String']>
  brand?: Maybe<Scalars['String']>
  expirationDate?: Maybe<Scalars['DateTime']>
  last4Digits?: Maybe<Scalars['String']>
}

export type GeneratePayPalToken_Out = {
  __typename?: 'GeneratePayPalToken_Out'
  token?: Maybe<Scalars['String']>
  url?: Maybe<Scalars['String']>
  returnUrl?: Maybe<Scalars['String']>
  cancelUrl?: Maybe<Scalars['String']>
}

export type GetPayPalAccountDetails_Out = {
  __typename?: 'GetPayPalAccountDetails_Out'
  email?: Maybe<Scalars['String']>
  id?: Maybe<Scalars['String']>
}

export type BankReference = {
  __typename?: 'BankReference'
  entity?: Maybe<Scalars['String']>
  reference?: Maybe<Scalars['String']>
  amount?: Maybe<Scalars['Float']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type SortRule = {
  dir?: Maybe<Scalars['String']>
  attr?: Maybe<Scalars['String']>
}

export type Client = {
  __typename?: 'Client'
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  balance?: Maybe<Scalars['Float']>
  fiscalNumber?: Maybe<Scalars['String']>
  paypalReference?: Maybe<Scalars['String']>
  address?: Maybe<Scalars['String']>
  postalCode?: Maybe<Scalars['String']>
  city?: Maybe<Scalars['String']>
  type?: Maybe<Scalars['String']>
  bonus?: Maybe<Scalars['Int']>
  transactionIdBond?: Maybe<Scalars['String']>
  easypayCustomer?: Maybe<Scalars['String']>
  lisboaVivaSn?: Maybe<Scalars['String']>
  nifCountry?: Maybe<Scalars['String']>
  numberNavegante?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type ClientCreditCard = {
  __typename?: 'ClientCreditCard'
  brand?: Maybe<Scalars['String']>
  last4Digits?: Maybe<Scalars['String']>
  expirationDate?: Maybe<Scalars['DateTime']>
  defaultCard?: Maybe<Scalars['Boolean']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Invoice = {
  __typename?: 'Invoice'
  client?: Maybe<Scalars['String']>
  number?: Maybe<Scalars['String']>
  date?: Maybe<Scalars['DateTime']>
  amount?: Maybe<Scalars['Float']>
  creditAmount?: Maybe<Scalars['Float']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type PromotionInstance = {
  __typename?: 'PromotionInstance'
  amount?: Maybe<Scalars['Float']>
  minTopUpAmount?: Maybe<Scalars['Float']>
  expirationDate?: Maybe<Scalars['DateTime']>
  active?: Maybe<Scalars['Boolean']>
  emelUserPayee?: Maybe<Scalars['String']>
  emelUserTrigger?: Maybe<Scalars['String']>
  emelUserTriggerName?: Maybe<Scalars['String']>
  promotion?: Maybe<Promotion>
  promoCode?: Maybe<Scalars['String']>
  promotionType?: Maybe<PromotionType>
  productCode?: Maybe<Product>
  registerPromotion?: Maybe<Scalars['Boolean']>
  appPromotion?: Maybe<Scalars['Boolean']>
  userSubscription?: Maybe<Scalars['String']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Promotion = {
  __typename?: 'Promotion'
  emelUser?: Maybe<Scalars['String']>
  promoCode?: Maybe<Scalars['String']>
  amount?: Maybe<Scalars['Float']>
  minTopUpAmount?: Maybe<Scalars['Float']>
  expirationDate?: Maybe<Scalars['DateTime']>
  registerPromotion?: Maybe<Scalars['Boolean']>
  paypalPayment?: Maybe<Scalars['Boolean']>
  mbPayment?: Maybe<Scalars['Boolean']>
  appPromotion?: Maybe<Scalars['Boolean']>
  vouchersLimit?: Maybe<Scalars['Int']>
  vouchersIssued?: Maybe<Scalars['Int']>
  limitPerUser?: Maybe<Scalars['Int']>
  productCode?: Maybe<Scalars['String']>
  promotionType?: Maybe<Scalars['String']>
  groupUserPromo?: Maybe<Scalars['String']>
  subscription?: Maybe<Scalars['String']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type PromotionType = {
  __typename?: 'PromotionType'
  productCodeSendys?: Maybe<Scalars['String']>
  active?: Maybe<Scalars['Boolean']>
  validityPeriod?: Maybe<Scalars['Int']>
  type?: Maybe<Scalars['String']>
  discount?: Maybe<Scalars['Int']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Product = {
  __typename?: 'Product'
  active?: Maybe<Scalars['Boolean']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Transaction = {
  __typename?: 'Transaction'
  client?: Maybe<Scalars['String']>
  invoice?: Maybe<Scalars['String']>
  parkingInstance?: Maybe<Scalars['String']>
  transactionType?: Maybe<Scalars['String']>
  amount?: Maybe<Scalars['Float']>
  transactionDate?: Maybe<Scalars['DateTime']>
  externalReference?: Maybe<Scalars['String']>
  externalTransactionDate?: Maybe<Scalars['DateTime']>
  transactionReason?: Maybe<Scalars['String']>
  transactionReasonDesc?: Maybe<Scalars['String']>
  transactionReasonAttach?: Maybe<Scalars['String']>
  origin?: Maybe<Scalars['String']>
  internalReference?: Maybe<Scalars['String']>
  userSubscription?: Maybe<Scalars['String']>
  creditNoteInvoice?: Maybe<Scalars['String']>
  isChecked?: Maybe<Scalars['Boolean']>
  code?: Maybe<Scalars['String']>
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  creationDate?: Maybe<Scalars['DateTime']>
  createdBy?: Maybe<Scalars['String']>
  updateDate?: Maybe<Scalars['DateTime']>
  updatedBy?: Maybe<Scalars['String']>
  defaultOrder?: Maybe<Scalars['Int']>
  version?: Maybe<Scalars['Int']>
}

export type Mutation = {
  __typename?: 'Mutation'
  registerNavigatorCard?: Maybe<Scalars['Boolean']>
  clearNavigatorCard?: Maybe<Scalars['Boolean']>
  createUserSubscription?: Maybe<UserSubscription>
  reserveBike?: Maybe<Scalars['Boolean']>
  cancelBikeReserve?: Maybe<Scalars['Boolean']>
  startTrip?: Maybe<Scalars['Boolean']>
  rateTrip?: Maybe<Scalars['Boolean']>
  tripPayWithPoints?: Maybe<Scalars['Int']>
  tripPayWithNoPoints?: Maybe<Scalars['Int']>
  subscriptionEasyPay?: Maybe<Scalars['Boolean']>
  subscriptionTopUpPayPalBond?: Maybe<Scalars['Boolean']>
  subscriptionTopUpPayPal?: Maybe<Scalars['Boolean']>
  subscriptionWallet?: Maybe<Scalars['Boolean']>
  acceptTermsAndConditions?: Maybe<Scalars['Boolean']>
  createCreditCardFrequentPayment?: Maybe<CreateCreditCardFrequentPayment_Out>
  updateCreditCardInfo?: Maybe<Scalars['Boolean']>
  removeCreditCard?: Maybe<Scalars['Boolean']>
  creditCardTopUp?: Maybe<Scalars['Boolean']>
  insertPromotionalCode?: Maybe<Array<Maybe<PromotionInstance>>>
  deleteClient?: Maybe<Scalars['Boolean']>
  registerClient?: Maybe<Scalars['Boolean']>
  validateLogin?: Maybe<LoginResult>
  topUpPayPal?: Maybe<Scalars['Boolean']>
  updatePayPalAccount?: Maybe<Scalars['Boolean']>
  clearPayPalAccount?: Maybe<Scalars['Boolean']>
  emailInvoices?: Maybe<Scalars['Boolean']>
  emailReturns?: Maybe<Scalars['Boolean']>
}

export type MutationRegisterNavigatorCardArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationClearNavigatorCardArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationCreateUserSubscriptionArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationReserveBikeArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationRateTripArgs = {
  in?: Maybe<RateTrip_In>
}

export type MutationTripPayWithPointsArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationTripPayWithNoPointsArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationSubscriptionEasyPayArgs = {
  in?: Maybe<SubscriptionEasyPay_In>
}

export type MutationSubscriptionTopUpPayPalBondArgs = {
  in?: Maybe<SubscriptionTopUpPayPalBond_In>
}

export type MutationSubscriptionTopUpPayPalArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationSubscriptionWalletArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationUpdateCreditCardInfoArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationRemoveCreditCardArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationCreditCardTopUpArgs = {
  in?: Maybe<CreditCardTopUp_In>
}

export type MutationInsertPromotionalCodeArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationRegisterClientArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationValidateLoginArgs = {
  in?: Maybe<ValidateLogin_In>
}

export type MutationTopUpPayPalArgs = {
  input?: Maybe<Scalars['Float']>
}

export type MutationUpdatePayPalAccountArgs = {
  input?: Maybe<Scalars['String']>
}

export type MutationEmailInvoicesArgs = {
  in?: Maybe<EmailInvoices_In>
}

export type MutationEmailReturnsArgs = {
  in?: Maybe<EmailReturns_In>
}

export type RateTrip_In = {
  code?: Maybe<Scalars['String']>
  rating?: Maybe<Scalars['Int']>
  description?: Maybe<Scalars['String']>
  attachment?: Maybe<Attachment>
}

export type Attachment = {
  bytes?: Maybe<Array<Scalars['Byte']>>
  fileName?: Maybe<Scalars['String']>
  mimeType?: Maybe<Scalars['String']>
}

export type SubscriptionEasyPay_In = {
  ccCode?: Maybe<Scalars['String']>
  userSubscription?: Maybe<Scalars['String']>
}

export type SubscriptionTopUpPayPalBond_In = {
  userSubscriptionCode?: Maybe<Scalars['String']>
  token?: Maybe<Scalars['String']>
}

export type CreateCreditCardFrequentPayment_Out = {
  __typename?: 'CreateCreditCardFrequentPayment_Out'
  code?: Maybe<Scalars['String']>
  url?: Maybe<Scalars['String']>
  successUrl?: Maybe<Scalars['String']>
  failUrl?: Maybe<Scalars['String']>
}

export type CreditCardTopUp_In = {
  code?: Maybe<Scalars['String']>
  amount?: Maybe<Scalars['Float']>
}

export type LoginResult = {
  __typename?: 'LoginResult'
  needsRgpdAcceptance?: Maybe<Scalars['Boolean']>
  needsTermsAcceptance?: Maybe<Scalars['Boolean']>
  messages?: Maybe<Array<Maybe<LoginResult_LoginMessage>>>
}

export type LoginResult_LoginMessage = {
  __typename?: 'LoginResult_LoginMessage'
  code?: Maybe<Scalars['String']>
  text?: Maybe<Scalars['String']>
}

export type ValidateLogin_In = {
  language?: Maybe<Scalars['String']>
  userAgent?: Maybe<Scalars['String']>
  firebaseToken?: Maybe<Scalars['String']>
}

export type EmailInvoices_In = {
  invoicesCodes?: Maybe<Array<Maybe<Scalars['String']>>>
  client?: Maybe<Scalars['String']>
  origin?: Maybe<Scalars['String']>
}

export type EmailReturns_In = {
  invoiceCodes?: Maybe<Array<Maybe<Scalars['String']>>>
  client?: Maybe<Scalars['String']>
}

export type Subscription = {
  __typename?: 'Subscription'
  serverDate?: Maybe<DateType>
  activeTripSubscription?: Maybe<TripDetailType>
  operationalStationsSubscription?: Maybe<Array<Maybe<StationInfoType>>>
}

export type SubscriptionServerDateArgs = {
  _access_token?: Maybe<Scalars['String']>
}

export type SubscriptionActiveTripSubscriptionArgs = {
  _access_token?: Maybe<Scalars['String']>
}

export type SubscriptionOperationalStationsSubscriptionArgs = {
  _access_token?: Maybe<Scalars['String']>
}

export type DateType = {
  __typename?: 'DateType'
  date: Scalars['DateTime']
}

export type TripDetailType = {
  __typename?: 'TripDetailType'
  code: Scalars['String']
  bike: Scalars['String']
  startDate: Scalars['DateTime']
  endDate?: Maybe<Scalars['DateTime']>
  cost?: Maybe<Scalars['Float']>
  finished: Scalars['Boolean']
  canceled: Scalars['Boolean']
  canPayWithMoney?: Maybe<Scalars['Boolean']>
  canUsePoints?: Maybe<Scalars['Boolean']>
  clientPoints?: Maybe<Scalars['Int']>
  tripPoints?: Maybe<Scalars['Int']>
  period: Scalars['String']
  periodTime: Scalars['String']
  error: Scalars['Int']
}

export type StationInfoType = {
  __typename?: 'StationInfoType'
  code: Scalars['String']
  name?: Maybe<Scalars['String']>
  description?: Maybe<Scalars['String']>
  serialNumber: Scalars['String']
  zone?: Maybe<Scalars['String']>
  location?: Maybe<Scalars['String']>
  latitude?: Maybe<Scalars['Float']>
  longitude?: Maybe<Scalars['Float']>
  assetType: Scalars['String']
  assetStatus: Scalars['String']
  assetCondition: Scalars['String']
  bikes: Scalars['Int']
  docks: Scalars['Int']
  stype?: Maybe<Scalars['String']>
}