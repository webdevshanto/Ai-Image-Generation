import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import type { CreatePlanGrantInput } from './plan-grant.schema.js';
import { grantProPlan, listPlanGrants } from './plan-grant.service.js';

export const createPlanGrant: RequestHandler = async (req, res) => {
  const grant = await grantProPlan(
    req.user!.id,
    req.body as CreatePlanGrantInput,
  );
  return sendSuccess(
    req,
    res,
    'Complimentary Pro access has been granted.',
    {
      grant: {
        ...grant.grant,
        user: grant.user,
        plan: grant.plan,
        startsAt: grant.startsAt,
        expiresAt: grant.expiresAt,
        subscriptionExtended: grant.subscriptionExtended,
      },
    },
    201,
  );
};

export const getPlanGrants: RequestHandler = async (req, res) => {
  const grants = await listPlanGrants();
  return sendSuccess(req, res, 'Recent manual plan grants are ready.', {
    grants,
  });
};
