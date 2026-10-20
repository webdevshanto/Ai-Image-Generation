import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response.js';
import {
  deleteUserVideo,
  getUserVideo,
  listUserVideos,
  uploadUserVideo,
} from './video.service.js';

const videoIdSchema = z.string().trim().min(1).max(128);

export const uploadVideoHandler: RequestHandler = async (req, res) => {
  const video = await uploadUserVideo(req.user!.id, req.file);
  return sendSuccess(
    req,
    res,
    'Video uploaded to your library.',
    { video },
    201,
  );
};

export const listVideosHandler: RequestHandler = async (req, res) => {
  const result = await listUserVideos(req.user!.id);
  return sendSuccess(req, res, 'Your video library is ready.', result);
};

export const getVideoHandler: RequestHandler = async (req, res) => {
  const videoId = videoIdSchema.parse(req.params.id);
  const video = await getUserVideo(req.user!.id, videoId);
  return sendSuccess(req, res, 'Video details are ready.', { video });
};

export const deleteVideoHandler: RequestHandler = async (req, res) => {
  const videoId = videoIdSchema.parse(req.params.id);
  await deleteUserVideo(req.user!.id, videoId);
  return sendSuccess(req, res, 'Video removed from your library.', null);
};
