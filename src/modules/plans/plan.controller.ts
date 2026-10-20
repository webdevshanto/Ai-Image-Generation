import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import type { ChangePlanInput } from './plan.schema.js';
import {
  changeUserPlan,
  getCurrentUserPlan,
  listPlans,
} from './plan.service.js';

export const getPlans: RequestHandler = async (req, res) => {
  const plans = await listPlans();
  return sendSuccess(req, res, 'Available plans are ready.', { plans });
};

export const getMyPlan: RequestHandler = async (req, res) => {
  const result = await getCurrentUserPlan(req.user!.id);
  return sendSuccess(req, res, 'Your current plan is ready.', result);
};

export const changeMyPlan: RequestHandler = async (req, res) => {
  const result = await changeUserPlan(
    req.user!.id,
    req.body as ChangePlanInput,
  );
  const message =
    result.status === 'downgrade_scheduled'
      ? 'Your Free plan will start when the current Pro period ends.'
      : result.status === 'cancellation_reversed'
        ? 'Your Pro cancellation was reversed; your access will continue.'
        : result.status === 'already_active'
          ? 'You are already on this plan.'
          : 'Your plan change request was accepted.';

  return sendSuccess(req, res, message, result);
};
