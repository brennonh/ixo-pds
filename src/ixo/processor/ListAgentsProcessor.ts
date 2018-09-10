import { AbstractHandler } from '../../handlers/AbstractHandler';
import { Agent } from '../model/AgentModel';
import { Request } from "../../handlers/Request";
import { dateTimeLogger } from '../common/shared';

export class ListAgentsProcessor extends AbstractHandler {

    updateCapabilities = (request: Request) => { }

    msgToPublish = (obj: any, request: Request) => { };

    process = (args: any) => {
        console.log(dateTimeLogger() + ' start new transaction ' + JSON.stringify(args));
        return this.queryTransaction(args, 'ListAgents', function (filter: any): Promise<any[]> {
            return new Promise(function (resolve: Function, reject: Function) {
                Agent.aggregate([
                    {
                        $match: filter
                    },
                    {
                        $lookup: {
                            "from": "agentstatuses",
                            let: {
                                "agentDid": "$agentDid",
                                "projectDid": "$projectDid"
                            },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                {
                                                    $eq: [
                                                        "$agentDid",
                                                        "$$agentDid"
                                                    ]
                                                },
                                                {
                                                    $eq: [
                                                        "$projectDid",
                                                        "$$projectDid"
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                            ],
                            as: "currentStatus"
                        }
                    },
                    { $unwind: { path: "$currentStatus", preserveNullAndEmptyArrays: true } },
                    { $sort: { "currentStatus.version": -1 } },
                    {
                        $group: {
                            "_id": "$_id",
                            "name": { $first: "$name" },
                            "agentDid": { $first: "$agentDid" },
                            "projectDid": { $first: "$projectDid" },
                            "role": { $first: "$role" },
                            "email": { $first: "$email" },
                            "currentStatus": { $first: "$currentStatus" }
                        }
                    }
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

export default new ListAgentsProcessor();