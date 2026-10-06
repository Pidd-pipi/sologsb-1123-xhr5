import { onVersionEvent } from './versionControl';
import { useMissionStore } from '../stores/missionStore';
import { useWaypointStore } from '../stores/waypointStore';
import { useAssetStore } from '../stores/assetStore';

let started = false;

/**
 * 订阅其他标签页的版本事件并重新同步本地 store。
 * 航线参数/航点/成果变更后，其他标签页会收到 mission-changed / mission-published，
 * 这里统一重拉三份数据；各标签页表单内未提交的输入是组件本地 state，不会被覆盖。
 */
export function setupVersionSync(): void {
  if (started) return;
  started = true;

  let timer: number | undefined;
  const resync = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void Promise.all([
        useMissionStore.getState().resync(),
        useWaypointStore.getState().load(),
        useAssetStore.getState().load(),
      ]);
    }, 400);
  };

  onVersionEvent((event) => {
    if (event.type === 'mission-published' || event.type === 'mission-changed' || event.type === 'publish-rollback') {
      resync();
    }
  });
}
