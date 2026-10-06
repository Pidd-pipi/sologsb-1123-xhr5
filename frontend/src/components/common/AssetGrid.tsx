import { Button, Card, Checkbox, Empty, Space, Tag, Typography } from 'antd';
import { AimOutlined } from '@ant-design/icons';
import type { ImageAsset, ImageQuality } from '../../types/imageasset';

export interface AssetGridProps {
  assets: ImageAsset[];
  thumbs: Record<string, string>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
  onLocate?: (asset: ImageAsset) => void;
  emptyText?: string;
}

const QUALITY_COLOR: Record<ImageQuality, string> = {
  合格: 'green',
  模糊: 'gold',
  过曝: 'red',
};

/**
 * 成果影像格子：缩略图、片号、GSD、质量角标与多选。
 * 被成果编目页（/missions/:id/assets）消费。
 */
export default function AssetGrid({
  assets,
  thumbs,
  selectedIds,
  onToggle,
  onToggleAll,
  onLocate,
  emptyText = '暂无成果影像条目',
}: AssetGridProps) {
  if (assets.length === 0) {
    return <Empty description={emptyText} />;
  }

  const allSelected = selectedIds.length === assets.length;

  return (
    <div data-testid="asset-grid">
      <Space style={{ marginBottom: 10 }} size={10} wrap>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedIds.length > 0 && !allSelected}
          onChange={() => onToggleAll?.(allSelected ? [] : assets.map((a) => a.id))}
        >
          全选（{assets.length} 张）
        </Checkbox>
        <Typography.Text type="secondary">已选 {selectedIds.length} 张</Typography.Text>
      </Space>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 12,
        }}
      >
        {assets.map((asset) => {
          const selected = selectedIds.includes(asset.id);
          return (
            <Card
              key={asset.id}
              size="small"
              hoverable
              style={{ borderColor: selected ? '#1677ff' : undefined }}
              styles={{ body: { padding: 8 } }}
            >
              <div style={{ position: 'relative' }}>
                <img
                  src={thumbs[asset.id]}
                  alt={asset.imageNo}
                  style={{ width: '100%', display: 'block', borderRadius: 4, background: '#eef2f6' }}
                />
                <div style={{ position: 'absolute', top: 4, left: 4 }}>
                  <Checkbox checked={selected} onChange={() => onToggle(asset.id)} />
                </div>
                <div style={{ position: 'absolute', top: 4, right: 4 }}>
                  <Tag color={QUALITY_COLOR[asset.quality]}>{asset.quality}</Tag>
                </div>
              </div>
              <Typography.Text strong style={{ display: 'block', marginTop: 6 }}>
                {asset.imageNo}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                GSD {asset.gsd} cm/px · 重叠 {asset.overlap}% · 倾角 {asset.tiltAngle}°
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                航高 {asset.altitude} m · {new Date(asset.shotAt).toLocaleString('zh-CN')}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                {asset.folder}
              </Typography.Text>
              {onLocate ? (
                <Button size="small" type="link" icon={<AimOutlined />} onClick={() => onLocate(asset)}>
                  定位到图
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
