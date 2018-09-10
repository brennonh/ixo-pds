import { AbstractHandler } from '../../handlers/AbstractHandler';
import { Claim } from '../model/ClaimModel';
import { Request } from "../../handlers/Request";
import { dateTimeLogger } from '../common/shared';

export class ListClaimProcessor extends AbstractHandler {

    updateCapabilities = (request: Request) => { }

    msgToPublish = (obj: any, request: Request) => { };

    process = (args: any) => {
        console.log(dateTimeLogger() + ' start new transaction ' + JSON.stringify(args));
        return this.queryTransaction(args, 'ListClaims', function (filter: any): Promise<any[]> {
            return new Promise(function (resolve: Function, reject: Function) {
                Claim.aggregate([
                    {
                        $match: filter
                    },
                    {
                        $lookup: {
                            "from": "evaluateclaims",
                            "localField": "txHash",
                            "foreignField": "claimId",
                            "as": "evaluations"
                        }
                    },
                    { $sort: { "evaluations.version": -1 } }
                ],
                    function (error: Error, result: any[]) {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result);
                        }
                    });
            });
        });
    }
}

export default new ListClaimProcessor();