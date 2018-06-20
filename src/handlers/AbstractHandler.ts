import { Document, Schema, Model, model } from "mongoose";
import { ITransactionModel, Transaction } from '../model/project/Transaction';
import { ICapabilitiesModel } from '../model/project/Capabilities';

import transactionService from '../service/TransactionLogService';
import capabilitiesService from '../service/CapabilitiesService';
import walletService from '../service/WalletService';

import { RequestValidator } from '../templates/RequestValidator';
import { validateJson } from '../templates/JsonValidator';
import { ValidatorResult } from 'jsonschema';
import { ValidationError } from '../error/ValidationError';
import { TransactionError } from '../error/TransactionError';

import { Request } from "../handlers/Request";
import TemplateUtils from '../templates/TemplateUtils';
import { SovrinUtils } from '../crypto/SovrinUtils';
import mq from '../MessageQ';
import { IWalletModel } from "../model/project/Wallet";
import { AxiosResponse } from "axios";

import Cache from '../Cache';

var wallet: IWalletModel;

export abstract class AbstractHandler {

  public createTransaction(args: any, capability: string, model: Model<any>, checkIfExist?: Function, projectDid?: string) {

    var inst = this;
    var request = new Request(args);
    return new Promise((resolve: Function, reject: Function) => {
      if (!request.projectDid) request.projectDid = (projectDid || "");
      capabilitiesService.findCapabilitiesForProject(request.projectDid)
        .then((result: ICapabilitiesModel) => {
          var capabilityMap: any;
          result.capabilities.forEach(element => {
            if (element.capability == capability) {
              capabilityMap = {
                capability: element.capability,
                template: element.template,
                allow: element.allow
              }
            }
          })
          return capabilityMap;
        }).catch((reason) => {
          console.log(new Date().getUTCMilliseconds() + 'capabilities not found for project' + request.projectDid);
          reject(new TransactionError('Capabilities not found for project'));
        })
        .then((capabilityMap: any) => {
          console.log(new Date().getUTCMilliseconds() + ' have capability ' + capabilityMap.capability);
          TemplateUtils.getTemplateFromCache(capabilityMap.template, request.template)
            .then((schema: any) => {
              console.log(new Date().getUTCMilliseconds() + ' validate the template');
              var validator: ValidatorResult;
              validator = validateJson(schema, args);
              if (validator.valid) {
                console.log(new Date().getUTCMilliseconds() + ' validate the capability');
                var capValid: RequestValidator;
                capValid = request.verifyCapability(capabilityMap.allow);
                if (capValid.valid) {
                  console.log(new Date().getUTCMilliseconds() + ' verify the signature');
                  request.verifySignature(this.preVerifyDidSignature)
                    .then((sigValid: RequestValidator) => {
                      if (sigValid.valid) {
                        console.log(new Date().getUTCMilliseconds() + ' signature verified');
                        if (checkIfExist) {
                          checkIfExist(request)
                            .then((found: boolean) => {
                              if (found) {
                                reject(new TransactionError('Record out of date or already exists'));
                              } else {
                                console.log(new Date().getUTCMilliseconds() + ' write transaction to log')
                                transactionService.createTransaction(request.payload, request.signature.type, request.signature.signatureValue, request.projectDid)
                                  .then((transaction: ITransactionModel) => {
                                    var obj = {
                                      ...request.data,
                                      txHash: transaction.hash,
                                      version: request.version + 1
                                    };
                                    console.log(new Date().getUTCMilliseconds() + ' updating the capabilities');
                                    this.updateCapabilities(request, capabilityMap.capability);
                                    console.log(new Date().getUTCMilliseconds() + ' commit to Elysian');
                                    resolve(model.create(obj));
                                    console.log(new Date().getUTCMilliseconds() + ' publish to blockchain');
                                    this.msgToPublish(obj, request, capabilityMap.capability)
                                      .then((msg: any) => {
                                        mq.publish(msg);
                                      });
                                    model.emit('postCommit', obj);
                                    console.log(new Date().getUTCMilliseconds() + ' transaction completed successfully');
                                  });
                              }
                            })
                        } else {
                          console.log(new Date().getUTCMilliseconds() + ' write transaction to log');
                          transactionService.createTransaction(request.payload, request.signature.type, request.signature.signatureValue, request.projectDid)
                            .then((transaction: ITransactionModel) => {
                              var obj = {
                                ...request.data,
                                txHash: transaction.hash
                              };
                              console.log(new Date().getUTCMilliseconds() + ' updating the capabilities');
                              inst.updateCapabilities(request, capabilityMap.capability);
                              console.log(new Date().getUTCMilliseconds() + ' commit to Elysian');
                              resolve(model.create(obj));
                              console.log(new Date().getUTCMilliseconds() + ' publish to blockchain');
                              this.msgToPublish(obj, request, capabilityMap.capability)
                                .then((msg: any) => {
                                  mq.publish(msg);
                                });
                              console.log(new Date().getUTCMilliseconds() + ' transaction completed successfully');
                            });
                        }
                      } else {
                        reject(new ValidationError(sigValid.errors[0]));
                      }
                    })
                } else {
                  reject(new ValidationError(capValid.errors[0]));
                }
              } else {
                reject(new ValidationError(validator.errors[0].message));
              };
            })
            .catch((reason) => {
              console.log(new Date().getUTCMilliseconds() + 'template registry failed' + reason);
              reject(new TransactionError('Cannot connect to template registry'));
            });
        });
    });
  }


  public queryTransaction(args: any, capability: string, query: Function) {
    var inst = this;
    var request = new Request(args);
    return new Promise((resolve: Function, reject: Function) => {
      capabilitiesService.findCapabilitiesForProject(request.projectDid)
        .then((result: ICapabilitiesModel) => {
          var capabilityMap: any;
          result.capabilities.forEach(element => {
            if (element.capability == capability) {
              capabilityMap = {
                capability: element.capability,
                template: element.template,
                allow: element.allow
              }
            }
          })
          return capabilityMap;
        }).catch((reason) => {
          console.log(new Date().getUTCMilliseconds() + 'capabilities not found for project' + request.projectDid);
          reject(new TransactionError('Capabilities not found for project'));
        })
        .then((capabilityMap: any) => {
          console.log(new Date().getUTCMilliseconds() + ' have capability ' + capabilityMap.capability);
          TemplateUtils.getTemplateFromCache(capabilityMap.template, request.template)
            .then((schema: any) => {
              console.log(new Date().getUTCMilliseconds() + ' validate the template');
              var validator: ValidatorResult;
              validator = validateJson(schema, args);
              if (validator.valid) {
                console.log(new Date().getUTCMilliseconds() + ' validate the capability');
                var capValid: RequestValidator;
                capValid = request.verifyCapability(capabilityMap.allow);
                if (capValid.valid) {
                  console.log(new Date().getUTCMilliseconds() + ' verify the signature');
                  request.verifySignature(this.preVerifyDidSignature)
                    .then((sigValid: RequestValidator) => {
                      if (sigValid.valid) {
                        console.log(new Date().getUTCMilliseconds() + ' query Elysian');
                        resolve(query(request.data));
                      } else {
                        reject(new ValidationError(sigValid.errors[0]));
                      }
                      console.log(new Date().getUTCMilliseconds() + ' transaction completed successfully');
                    })
                } else {
                  reject(new ValidationError(capValid.errors[0]));
                }
              } else {
                reject(new ValidationError(validator.errors[0].message));
              };
            })
            .catch((reason) => {
              console.log(new Date().getUTCMilliseconds() + 'template registry failed' + reason);
              reject(new TransactionError('Cannot connect to template registry'));
            });
        });
    });
  }


  preVerifyDidSignature(didResponse: AxiosResponse, data: Request): boolean {
    return true;
  }

  addCapabilities(projectDid: string, did: string, requestType: string) {
    capabilitiesService.addCapabilities(projectDid, did, requestType);
  }

  removeCapabilities(projectDid: string, did: string, requestType: string) {
    capabilitiesService.removeCapabilities(projectDid, did, requestType);
  }

  generateProjectWallet(): Promise<string> {
    return new Promise((resolve: Function, reject: Function) => {
      var fileSystem = require('fs');
      var data = JSON.parse(fileSystem.readFileSync(process.env.CONFIG, 'utf8'));

      var sovrinUtils = new SovrinUtils();
      var mnemonic = sovrinUtils.generateBip39Mnemonic();
      var sovrinWallet = sovrinUtils.generateSdidFromMnemonic(mnemonic);
      var did = String("did:ixo:" + sovrinWallet.did);
      walletService.createWallet(did, sovrinWallet.secret.signKey, sovrinWallet.verifyKey)
        .then((resp: IWalletModel) => {
          wallet = resp;
          Cache.set(wallet.did, { pubKey: wallet.verifyKey });
          console.log(new Date().getUTCMilliseconds() + ' project wallet created');
          resolve(wallet.did);
        });
    });
  }

  abstract updateCapabilities(request: Request, methodCall: string): void;

  abstract msgToPublish(obj: any, request: Request, methodCall: string): any;

  getWallet(): IWalletModel {
    return wallet;
  }

  signMessageForBlockchain(msgToSign: any, projectDid: string) {
    return new Promise((resolve: Function, reject: Function) => {
      walletService.getWallet(projectDid)
        .then((wallet: IWalletModel) => {
          var sovrinUtils = new SovrinUtils();
          var signedMsg = {
            ...msgToSign,
            signature: {
              signatureValue: [1, sovrinUtils.signDocumentNoEncoding(wallet.signKey, wallet.verifyKey, wallet.did, msgToSign.payload[1])],
              created: new Date()
            }
          }

          resolve(new Buffer(JSON.stringify(signedMsg)).toString('hex'));
        });
    });
  }

  selfSignMessage(msgToSign: any, projectDid: string) {
    return new Promise((resolve: Function, reject: Function) => {
      walletService.getWallet(projectDid)
        .then((wallet: IWalletModel) => {
          Cache.set(wallet.did, { pubKey: wallet.verifyKey });
          var sovrinUtils = new SovrinUtils();
          resolve(sovrinUtils.signDocumentNoEncoding(wallet.signKey, wallet.verifyKey, wallet.did, msgToSign));
        });
    });
  }
}