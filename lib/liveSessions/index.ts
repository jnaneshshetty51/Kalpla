import { isDailyConfigured, createDailyRoom, createDailyMeetingToken } from "./daily";

export { isDailyConfigured as isVideoProviderConfigured };

export interface VideoRoom {
  name: string;
  url: string;
}

export interface CreateRoomParams {
  name?: string;
  expiresAt: number;
  maxParticipants?: number;
}

/** Provider-agnostic room creation — call sites never import ./daily directly. */
export function createRoom(params: CreateRoomParams): Promise<VideoRoom> {
  return createDailyRoom(params);
}

export interface CreateJoinTokenParams {
  roomName: string;
  userId: string;
  userName: string;
  isOwner: boolean;
  expiresAt: number;
}

/** Provider-agnostic per-user join token — call sites never import ./daily directly. */
export function createJoinToken(params: CreateJoinTokenParams): Promise<string> {
  return createDailyMeetingToken(params);
}
