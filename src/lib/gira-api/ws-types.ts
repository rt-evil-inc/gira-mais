export type WSEvent = {
    id: null | string;
    type: string;
    payload: Payload | null;
}

export type Payload = {
    data: Data;
    extensions: Extensions;
}

export type Data = {
    activeTripSubscription?: ActiveTripSubscription;
    operationalStationsSubscription?: OperationalStationsSubscription[];
    serverDate?: ServerDate;
}

export type ActiveTripSubscription = {
    code: string;
    bike: string;
    startDate: Date;
    endDate: Date|null;
    cost: null|number;
    finished: boolean;
    canPayWithMoney: boolean|null;
    canUsePoints: boolean|null;
    clientPoints: number|null;
    tripPoints: number|null;
    canceled: boolean;
    period: string;
    periodTime: string;
    error: number;
}

export type OperationalStationsSubscription = {
    assetCondition: AssetCondition;
    assetStatus: AssetStatus;
    assetType: AssetType;
    code: string;
    description: null | string;
    latitude: number;
    longitude: number;
    name: string;
    bikes: number;
    docks: number;
    serialNumber: string;
    stype: Stype | null;
}

export enum AssetCondition {
    New = 'new',
}

export enum AssetStatus {
    Active = 'active',
    Repair = 'repair',
}

export enum AssetType {
    Station = 'station',
}

export enum Stype {
    A = 'A',
    B = 'B',
}

export type Extensions = {
    tracing: Tracing;
}

export type Tracing = {
    version: number;
    startTime: Date;
    endTime: Date;
    duration: number;
    parsing: Parsing;
    validation: Parsing;
    execution: Execution;
}

export type Execution = {
    resolvers: any[];
}

export type Parsing = {
    startOffset: number;
    duration: number;
}

export interface ServerDate {
  date: string
}

export interface Validation {
  startOffset: number
  duration: number
}