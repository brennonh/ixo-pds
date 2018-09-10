import { AbstractHandler } from '../../handlers/AbstractHandler';
import { Agent, IAgentModel } from '../model/AgentModel';
import { ProjectStatus, IProjectStatusModel } from '../model/ProjectStatusModel';
import { Request } from "../../handlers/Request";
import { dateTimeLogger } from '../common/shared';

export class CreateAgentProcessor extends AbstractHandler {

    updateCapabilities = (request: Request) => {
        this.addCapabilities(request.projectDid, 'did:sov:*', 'CreateAgent');
        this.addCapabilities(request.projectDid, request.signature.creator, 'UpdateAgentStatus');
        this.addCapabilities(request.projectDid, request.projectDid, 'UpdateAgentStatus');
        this.addCapabilities(request.projectDid, request.signature.creator, 'ListAgents');
        this.addCapabilities(request.projectDid, request.signature.creator, 'ListClaims');
        this.addCapabilities(request.projectDid, request.signature.creator, 'UpdateProjectStatus');
        this.addCapabilities(request.projectDid, request.projectDid, 'UpdateProjectStatus');
    }

    msgToPublish = (obj: any, request: Request) => {
        return new Promise((resolve: Function, reject: Function) => {
            var blockChainPayload: any;
            var txHash = obj.txHash;
            delete obj.version;
            delete obj.txHash;
            delete obj._creator;
            delete obj._created;
            delete obj.autoApprove;

            let data = {
                data: {
                    did: obj.agentDid,
                    role: obj.role,
                },
                txHash: txHash,
                senderDid: request.signature.creator,
                projectDid: request.projectDid
            }
            blockChainPayload = {
                payload: [17, new Buffer(JSON.stringify(data)).toString('hex').toUpperCase()]
            }
            resolve(this.signMessageForBlockchain(blockChainPayload, request.projectDid));
        });
    }

    checkKycCredentials = (didDoc: any): boolean => {
        if (didDoc.credentials) {
            didDoc.credentials.forEach((element: any) => {
                if (element.credential.claim.KYCValidated === true) {
                    return true;
                }
            });
        }
        return false;
    }

    preVerifyDidSignature = (didDoc: any, request: Request, capability: string) => {
        if (request.data.role != 'SA') {
            return this.checkKycCredentials(didDoc);
        }
        return true;
    }

    process = (args: any) => {
        console.log(dateTimeLogger() + ' start new transaction ' + JSON.stringify(args));
        return this.createTransaction(args, 'CreateAgent', Agent, function (request: any): Promise<boolean> {
            return new Promise(function (resolve: Function, reject: Function) {
                // check that and Agent cannot be EA and SA on same project
                Agent.find(
                    {
                        projectDid: request.data.projectDid,
                        agentDid: request.data.agentDid
                    },
                    function (error: Error, results: IAgentModel[]) {
                        if (error) {
                            reject(error);
                        } else {
                            if (results.some(elem => (elem.role === request.data.role) ||
                                (elem.role === 'EA' && request.data.role === 'SA') ||
                                (elem.role === 'SA' && request.data.role === 'EA')))
                                reject("Agent already exissts on this project in another role");
                        }
                    });

                // check to see that the project status is in a state that allows us to Create Agents  
                const validStatus = ["CREATED", "PENDING", "FUNDED", "STARTED"];
                ProjectStatus.find(
                    {
                        projectDid: request.data.projectDid
                    },
                    (error: Error, results: IProjectStatusModel[]) => {
                        if (error) {
                            reject(error);
                        } else {
                            if (results.length > 0 && validStatus.some(elem => elem === results[0].status)) {
                                resolve(results[0]);
                            }
                            reject("Invalid Project Status. Valid statuses are " + validStatus.toString());
                        }
                    }).limit(1).sort({ $natural: -1 })

            });
        });
    }
}

export default new CreateAgentProcessor();