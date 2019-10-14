import {DataSource, UnSupportedReason} from '../DataSource';
import {FitbitStepMeasure} from './FitbitStepMeasure';
import {FitbitHeartRateMeasure} from './FitbitHeartRateMeasure';
import {AsyncStorageHelper} from '../../../system/AsyncStorageHelper';
import {refresh, authorize, revoke} from 'react-native-app-auth';
import { FitbitSleepMeasure } from './FitbitSleepMeasure';
import { FitbitWeightMeasure } from './FitbitWeightMeasure';
import { FitbitWorkoutMeasure } from './FitbitWorkoutMeasure';

interface FitbitCredential {
  readonly client_secret: string;
  readonly client_id: string;
  readonly redirect_uri: string;
}

const FITBIT_DATE_FORMAT = "yyyy-MM-dd"
const FITBIT_TIME_FORMAT = "HH:mm"

const FITBIT_INTRADAY_ACTIVITY_API_URL = `https://api.fitbit.com/1/user/-/{resourcePath}/date/{date}/1d/1min/time/{startTime}/{endTime}.json`
const FITBIT_SLEEP_LOGS_URL = "https://api.fitbit.com/1.2/user/-/sleep/date/{startDate}/{endDate}.json"
const FITBIT_WEIGHT_LOGS_URL = "https://api.fitbit.com/1/user/-/body/weight/date/[startDate]/[endDate].json"
const FITBIT_HEARTRATE_LOGS_URL = "https://api.fitbit.com/1/user/-/activities/heart/date/{date}/{endDate}/1sec/time/{startTime}/{endTime}.json"

/**
 * 
 * 
 * @param config start and end time must be within the same date
 */
function makeFitbitIntradayActivityApiUrl(resourcePath: string, start: Date, end: Date): string{
  const moment = require('moment');
  const stringFormat = require('string-format');
  const startMoment = moment(start)
  const endMoment = moment(end)
  return stringFormat(FITBIT_INTRADAY_ACTIVITY_API_URL, {
    resourcePath: resourcePath,
    date: startMoment.format(FITBIT_DATE_FORMAT),
    startTime: startMoment.format(FITBIT_TIME_FORMAT),
    endTime: endMoment.format(FITBIT_TIME_FORMAT)
  })
}

function makeFitbitSleepApiUrl(startDate: Date, endDate: Date): string{
  const moment = require('moment');
  const stringFormat = require('string-format');
  return stringFormat(FITBIT_SLEEP_LOGS_URL, {
    startDate: moment(startDate).format(FITBIT_DATE_FORMAT),
    endDate: moment(endDate).format(FITBIT_DATE_FORMAT)
  })
}

function makeFitbitWeightApiUrl(startDate: Date, endDate: Date): string{
  const moment = require('moment');
  const stringFormat = require('string-format');
  return stringFormat(FITBIT_WEIGHT_LOGS_URL, {
    startDate: moment(startDate).format(FITBIT_DATE_FORMAT),
    endDate: moment(endDate).format(FITBIT_DATE_FORMAT)
  })
}

function makeFitbitHeartRateApiUrl(startDate: Date, endDate: Date, startTime?: string, endTime?: string): string{
  const moment = require('moment');
  const stringFormat = require('string-format');
  return stringFormat(FITBIT_HEARTRATE_LOGS_URL, {
    startDate: moment(startDate).format(FITBIT_DATE_FORMAT),
    endDate: moment(endDate).format(FITBIT_DATE_FORMAT),
    startTime: startTime,
    endTime: endTime
  })
}

const STORAGE_KEY_AUTH_STATE = DataSource.STORAGE_PREFIX + 'fitbit:state';
const STORAGE_KEY_AUTH_CURRENT_SCOPES =
  DataSource.STORAGE_PREFIX + 'fitbit:scopes';

async function registerScopeAndGet(scope: string): Promise<Array<string>> {
  const currentScopes = await AsyncStorageHelper.getObject(
    STORAGE_KEY_AUTH_CURRENT_SCOPES,
  );
  if (currentScopes) {
    if (currentScopes.indexOf(scope) >= 0) {
      return currentScopes;
    } else {
      currentScopes.push(scope);
      await AsyncStorageHelper.set(
        STORAGE_KEY_AUTH_CURRENT_SCOPES,
        currentScopes,
      );
      return currentScopes;
    }
  } else {
    const newScopes = [scope];
    await AsyncStorageHelper.set(STORAGE_KEY_AUTH_CURRENT_SCOPES, newScopes);
    return newScopes;
  }
}

export class FitbitSource extends DataSource {
  key: string = 'fitbit';
  name: string = 'Fitbit';
  description: string = 'Fitbit Fitness Tracker';
  thumbnail = require('../../../../assets/images/services/service_fitbit.jpg');

  supportedMeasures = [
    new FitbitStepMeasure(this),
    new FitbitHeartRateMeasure(this),
    new FitbitSleepMeasure(this),
    new FitbitWeightMeasure(this),
    new FitbitWorkoutMeasure(this)
  ];

  private _credential: FitbitCredential = null;
  private _authConfigBase = null;
  get credential(): FitbitCredential {
    return this._credential;
  }

  private async makeConfig(scope: string): Promise<any> {
    const appendedScopes = await registerScopeAndGet(scope);
    const copiedConfig = JSON.parse(JSON.stringify(this._authConfigBase));
    copiedConfig.scopes = appendedScopes;
    return copiedConfig;
  }

  async checkTokenValid(): Promise<boolean> {
    const state = await AsyncStorageHelper.getObject(STORAGE_KEY_AUTH_STATE);
    return (
      state != null &&
      new Date(state.accessTokenExpirationDate).getTime() > Date.now()
    );
  }

  async authenticate(scope: string): Promise<boolean> {
    const state = await AsyncStorageHelper.getObject(STORAGE_KEY_AUTH_STATE);
    if (state) {
      try {
        const newState = await refresh(await this.makeConfig(scope), {
          refreshToken: state.refreshToken,
        });
        if (newState) {
          await AsyncStorageHelper.set(STORAGE_KEY_AUTH_STATE, newState);
          return true;
        }
      } catch (e) {
        console.log(e);
      }
    }

    try {
      const newState = await authorize(await this.makeConfig(scope));
      if (newState) {
        await AsyncStorageHelper.set(STORAGE_KEY_AUTH_STATE, newState);
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  }

  async signOut(): Promise<void> {
    const state = await AsyncStorageHelper.getObject(STORAGE_KEY_AUTH_STATE);
    if (state) {
      await revoke(this._authConfigBase, {tokenToRevoke: state.refreshToken});
      AsyncStorageHelper.remove(STORAGE_KEY_AUTH_STATE);
    }
  }

  private async revokeScopeAndGet(
    scope: string,
  ): Promise<{removed: boolean; result: Array<string>}> {
    const currentScopes = (await AsyncStorageHelper.getObject(
      STORAGE_KEY_AUTH_CURRENT_SCOPES,
    )) as Array<string>;
    if (currentScopes) {
      const scopeIndex = currentScopes.indexOf(scope);
      if (scopeIndex >= 0) {
        currentScopes.splice(scopeIndex, 1);
        await AsyncStorageHelper.set(
          STORAGE_KEY_AUTH_CURRENT_SCOPES,
          currentScopes,
        );
        return {removed: true, result: currentScopes};
      } else {
        return {removed: false, result: currentScopes};
      }
    } else {
      return {removed: false, result: []};
    }
  }

  async revokeScope(scope: string): Promise<boolean> {
    const scopeRevokeResult = await this.revokeScopeAndGet(scope);
    if (scopeRevokeResult.removed === true) {
      if (scopeRevokeResult.result.length === 0) {
        try {
          await this.signOut();
          return true;
        } catch (e) {
          console.log(e);
          return false;
        }
      } else {
        try {
          const state = await AsyncStorageHelper.getObject(
            STORAGE_KEY_AUTH_STATE,
          );
          const newState = await refresh(
            {...this._authConfigBase, scopes: scopeRevokeResult.result},
            {
              refreshToken: state.refreshToken,
            },
          );
          if (newState) {
            await AsyncStorageHelper.set(STORAGE_KEY_AUTH_STATE, newState);
            return true;
          }
        } catch (e) {
          console.log(e);
          return false;
        }
      }
    }
    return true;
  }

  async fetchFitbitQuery<T>(url: string): Promise<T>{
    const state = await AsyncStorageHelper.getObject(STORAGE_KEY_AUTH_STATE);
    return fetch(url, {
      method: 'GET',
      headers: {
        "Accept-Language": 'en_US',
        "Authorization": "Bearer " + state.accessToken,
        'Content-Type': 'application/json'
      }
    }).then(result => result.json())
  }

  protected onCheckSupportedInSystem(): Promise<{
    supported: boolean;
    reason?: UnSupportedReason;
  }> {
    try {
      this._credential = require('../../../../credentials/fitbit.json');
      this._authConfigBase = {
        clientId: this._credential.client_id,
        clientSecret: this._credential.client_secret,
        redirectUrl: this._credential.redirect_uri,
        serviceConfiguration: {
          authorizationEndpoint: 'https://www.fitbit.com/oauth2/authorize',
          tokenEndpoint: 'https://api.fitbit.com/oauth2/token',
          revocationEndpoint: 'https://api.fitbit.com/oauth2/revoke',
        },
      };
      return Promise.resolve({supported: true});
    } catch (e) {
      console.log(e);
      return Promise.resolve({
        supported: false,
        reason: UnSupportedReason.Credential,
      });
    }
  }
}
