import Bottleneck from "bottleneck";

export interface Groups {
  global?: Bottleneck.Group;
  write?: Bottleneck.Group;
  search?: Bottleneck.Group;
  notifications?: Bottleneck.Group;
}
