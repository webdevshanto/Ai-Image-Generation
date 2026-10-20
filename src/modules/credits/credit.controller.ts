import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { getCreditHistory, getCreditSummary } from './credit.service.js';

export const getCredits: RequestHandler = async (req, res) => {
  const summary = await getCreditSummary(req.user!.id);
  return sendSuccess(req, res, 'Your monthly generation credits are ready.', {
    credits: summary,
  });
};

export const getCreditTransactions: RequestHandler = async (req, res) => {
  const transactions = await getCreditHistory(req.user!.id);
  return sendSuccess(req, res, 'Your recent credit activity is ready.', {
    transactions,
  });
};
