"""包入口：`python -m hwobs`（原来的根级 hw_server.py 退役进包）。"""

import os
import sys
import traceback

from hwobs.app import main

if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException:
        # H④：windowed 打包（console=False）下未捕获异常会交给 PyInstaller
        # 引导器处理 —— 它弹一个看不见的错误对话框并永久阻塞（诊断：崩溃时
        # threading.enumerate() 只有 MainThread，无任何非 daemon 线程；滞留
        # 进程还占着单实例 mutex，用户不杀进程就再也起不来）。所以异常在
        # 这里自己消化：traceback 写 stderr（打包版已由 setup_stdio 落到
        # crash.log），然后 os._exit —— 引导器层挂住时 sys.exit/正常解释器
        # 退出都走不到，必须硬退。正常返回路径（uvicorn 优雅停服、管理页
        # "退出程序"按钮）不经过这里，解释器照常收尾，不受影响。
        try:
            traceback.print_exc()
            sys.stderr.flush()
        except Exception:
            pass
        os._exit(1)
