/**
 * 跨模块共享的 DI token。
 * 用字符串常量而非 class token 的场景：注入的是「值」（路径 / 配置）而非服务实例。
 */
/** 页面数据落盘根目录（默认 <cwd>/data，可用 LC_DATA_DIR 覆盖） */
export const DATA_DIR = 'LC:DATA_DIR'
